import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  validateExecutionPlan,
  recordExperimentAttempt
} from '@learnlab/core';
import type {
  ExecutionCompleteEvent,
  ExecutionPlan,
  ExecutionPlanError,
  ExperimentCloseResult,
  PluginPermissionDecision,
  PluginPermissionRequest
} from '@learnlab/core-types';
import type { Result } from '@learnlab/core-types';
import { prepareExperimentLaunch } from '../services/experiment-launch';
import { hasPluginGrant, savePluginGrant } from '../services/plugin-grants';
import { getPluginHostService, type PluginHostEvent } from '../services/plugin-host';
import { DesktopDatabaseService } from '../services/database';
import {
  assertPackageInsideTrustedWorkspace,
  assertTrustedPackage,
  assertTrustedRenderer,
  getTrustedPackageDirs,
  requireNonEmptyString
} from './security';

interface CloseScope {
  sender: WebContents;
  packageDir: string;
  labId?: string;
}

function matchesScope(scope: CloseScope, sender: WebContents, plan: ExecutionPlan): boolean {
  return scope.sender === sender && scope.packageDir === plan.packageDir &&
    (scope.labId === undefined || scope.labId === plan.labId);
}

function sendToRenderer(contents: WebContents, channel: string, data: unknown): void {
  if (!contents.isDestroyed()) contents.send(channel, data);
}

export function registerExecutionIpc(): () => Promise<boolean> {
  const host = getPluginHostService();

  // Forward host events to the renderer that started the execution
  // We track which renderer owns which executionId so we route correctly.
  const ownerMap = new Map<string, { sender: WebContents; plan: ExecutionPlan }>();
  const preparing = new Map<string, {
    sender: WebContents;
    plan: ExecutionPlan;
    controller: AbortController;
  }>();
  const permissions = new Map<string, {
    sender: WebContents;
    resolve: (decision: PluginPermissionDecision) => void;
  }>();
  const pendingCloses = new Set<CloseScope>();
  const observed = new WeakSet<WebContents>();
  const historyWrites = new Set<Promise<void>>();
  const grantWrites = new Set<Promise<void>>();
  let stopping = false;

  function observeOwner(sender: WebContents): void {
    if (observed.has(sender)) return;
    observed.add(sender);
    const cleanup = () => {
      for (const [id, request] of preparing) {
        if (request.sender !== sender) continue;
        preparing.delete(id);
        request.controller.abort();
      }
      for (const [id, owner] of ownerMap) {
        if (owner.sender === sender) void host.cancel(id);
      }
    };
    sender.on('render-process-gone', cleanup);
    sender.on('did-start-navigation', (_event, _url, isSameDocument, isMainFrame) => {
      if (isMainFrame && !isSameDocument) cleanup();
    });
    sender.once('destroyed', cleanup);
  }

  async function requestPermission(
    sender: WebContents, data: Omit<PluginPermissionRequest, 'requestId'>, signal: AbortSignal
  ): Promise<PluginPermissionDecision | 'cancelled'> {
    const requestId = randomUUID();
    let abort: () => void = () => undefined;
    try {
      return await new Promise((resolve) => {
        abort = () => resolve('cancelled');
        signal.addEventListener('abort', abort, { once: true });
        permissions.set(requestId, { sender, resolve });
        if (signal.aborted || sender.isDestroyed()) abort();
        else sendToRenderer(sender, 'execution:permission-request', { ...data, requestId });
      });
    } finally {
      signal.removeEventListener('abort', abort);
      permissions.delete(requestId);
      sendToRenderer(sender, 'execution:permission-closed', requestId);
    }
  }

  ipcMain.handle('execution:respond-permission', (event, requestId: unknown, decision: unknown) => {
    assertTrustedRenderer(event);
    if (typeof requestId !== 'string' ||
        (decision !== 'once' && decision !== 'always' && decision !== 'denied')) return false;
    const pending = permissions.get(requestId);
    if (!pending || pending.sender !== event.sender) return false;
    permissions.delete(requestId);
    pending.resolve(decision);
    return true;
  });

  host.on('event', (event: PluginHostEvent) => {
    const { executionId } = event.data;
    const owner = ownerMap.get(executionId);
    if (!owner) return;

    if (event.type === 'output') {
      sendToRenderer(owner.sender, 'execution:output', event.data);
    } else {
      ownerMap.delete(executionId);
      const write = recordCompletionToHistory(event.data, event.plan).then(() => {
        sendToRenderer(owner.sender, 'execution:complete', event.data);
      });
      historyWrites.add(write);
      void write.then(() => historyWrites.delete(write), () => historyWrites.delete(write));
    }
  });

  ipcMain.handle(
    'execution:start',
    async (ipcEvent, rawPlan: unknown): Promise<Result<{ executionId: string }, ExecutionPlanError>> => {
      assertTrustedRenderer(ipcEvent);

      const trustedDirs = getTrustedPackageDirs(ipcEvent.sender);
      const validation = validateExecutionPlan(rawPlan, trustedDirs);
      if (!validation.ok) return validation;

      const plan = validation.value;
      if (stopping) {
        return { ok: false, error: { type: 'execution_cancelled', message: 'LearnLab 正在退出。' } };
      }
      if (process.platform === 'win32') {
        return { ok: false, error: { type: 'permission_unavailable', message: 'Windows 的插件进程回收仍在开发，当前可阅读实验说明。' } };
      }
      const isClosing = () => [...pendingCloses].some((scope) =>
        matchesScope(scope, ipcEvent.sender, plan)
      );

      // Re-validate the package dir via the standard trusted-package check
      assertTrustedPackage(ipcEvent.sender, plan.packageDir);

      if (isClosing()) {
        return { ok: false, error: { type: 'execution_already_running', message: '正在处理实验标签关闭' } };
      }

      const activeScope = { sender: ipcEvent.sender, packageDir: plan.packageDir, labId: plan.labId };
      const existing = [...ownerMap.values(), ...preparing.values()].some(
        (owner) => matchesScope(activeScope, owner.sender, owner.plan)
      );
      if (host.isRunning(plan.executionId) || preparing.has(plan.executionId) || existing) {
        return {
          ok: false,
          error: { type: 'execution_already_running', message: '实验已有执行正在运行或退出' }
        };
      }

      const request = { sender: ipcEvent.sender, plan, controller: new AbortController() };
      preparing.set(plan.executionId, request);
      observeOwner(request.sender);
      const isCurrent = () => preparing.get(plan.executionId) === request &&
        !request.sender.isDestroyed() && !isClosing() && !stopping;
      const cancelled = { ok: false, error: { type: 'execution_cancelled', message: '已取消启动实验。' } } as const;
      try {
        await assertPackageInsideTrustedWorkspace(request.sender, plan.packageDir);
        const launch = await prepareExperimentLaunch(plan);
        if (!isCurrent()) return cancelled;
        if (!launch.ok) return launch;
        let prepared = launch.value;
        if (!await hasPluginGrant(prepared.grantKey)) {
          if (!isCurrent()) return cancelled;
          const decision = await requestPermission(request.sender, {
            pluginId: plan.pluginId,
            pluginVersion: prepared.pluginVersion,
            packageName: prepared.packageName,
            experimentTitle: prepared.experimentTitle,
            permissions: prepared.permissions
          }, request.controller.signal);
          if (!isCurrent() || decision === 'cancelled') return cancelled;
          if (decision === 'denied') {
            return { ok: false, error: { type: 'permission_denied', message: '已拒绝插件执行请求。' } };
          }
          await assertPackageInsideTrustedWorkspace(request.sender, plan.packageDir);
          const current = await prepareExperimentLaunch(plan);
          if (!isCurrent()) return cancelled;
          if (!current.ok) return current;
          if (current.value.grantKey !== prepared.grantKey) {
            return {
              ok: false,
              error: { type: 'permission_unavailable', message: '授权期间插件或权限范围发生变化，请重新运行实验。' }
            };
          }
          prepared = current.value;
          if (decision === 'always') {
            const write = savePluginGrant(prepared.grantKey);
            grantWrites.add(write);
            try {
              await write;
            } catch {
              return {
                ok: false,
                error: { type: 'permission_unavailable', message: '无法保存插件授权，请重试或选择单次允许。' }
              };
            } finally {
              grantWrites.delete(write);
            }
          }
        }
        if (!isCurrent()) return cancelled;

        ownerMap.set(plan.executionId, request);
        try {
          host.start(plan, prepared.entrypoint, prepared.entrySource, prepared.resources);
        } catch (error) {
          ownerMap.delete(plan.executionId);
          throw error;
        }
        return { ok: true, value: { executionId: plan.executionId } };
      } finally {
        if (preparing.get(plan.executionId) === request) preparing.delete(plan.executionId);
      }
    }
  );

  ipcMain.handle('execution:cancel', async (ipcEvent, executionId: string) => {
    assertTrustedRenderer(ipcEvent);
    if (typeof executionId !== 'string') return;
    const request = preparing.get(executionId);
    if (request?.sender === ipcEvent.sender) {
      preparing.delete(executionId);
      request.controller.abort();
    }
    if (ownerMap.get(executionId)?.sender !== ipcEvent.sender) return;
    if (!await host.cancel(executionId)) throw new Error('未能确认实验进程已退出，请重试。');
  });

  ipcMain.handle('execution:is-running', (ipcEvent, executionId: string) => {
    assertTrustedRenderer(ipcEvent);
    return typeof executionId === 'string' && ownerMap.get(executionId)?.sender === ipcEvent.sender &&
      host.isRunning(executionId);
  });

  ipcMain.handle('execution:confirm-close', async (ipcEvent, packageDir: string, labId?: string): Promise<ExperimentCloseResult> => {
    assertTrustedRenderer(ipcEvent);
    const scope: CloseScope = {
      sender: ipcEvent.sender,
      packageDir: assertTrustedPackage(ipcEvent.sender, packageDir),
      labId: labId === undefined ? undefined : requireNonEmptyString(labId, 'labId')
    };
    const alreadyClosing = [...pendingCloses].some((pending) =>
      pending.sender === scope.sender && pending.packageDir === scope.packageDir &&
      (pending.labId === undefined || scope.labId === undefined || pending.labId === scope.labId)
    );
    if (alreadyClosing) return { status: 'cancelled' };

    const cancelPreparation = () => {
      for (const [id, request] of preparing) {
        if (!matchesScope(scope, request.sender, request.plan)) continue;
        preparing.delete(id);
        request.controller.abort();
      }
    };
    const executions = [...ownerMap.entries()]
      .filter(([, owner]) => matchesScope(scope, owner.sender, owner.plan));
    if (executions.length === 0) {
      cancelPreparation();
      return { status: 'close' };
    }

    const window = BrowserWindow.fromWebContents(scope.sender);
    if (!window) return { status: 'cancelled' };
    pendingCloses.add(scope);
    try {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning',
        title: '关闭实验标签',
        message: scope.labId === undefined
          ? '当前实验包仍有实验进程在运行。'
          : '该实验仍有专用进程在运行。',
        detail: '强制退出将结束相关实验进程。选择取消可保留标签。',
        buttons: ['强制退出', '取消'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      });
      if (response !== 0) return { status: 'cancelled' };
      cancelPreparation();

      const stopped = await Promise.all(executions.map(([id, owner]) =>
        ownerMap.get(id) === owner ? host.cancel(id) : true
      ));
      if (stopped.every(Boolean)) return { status: 'close' };
      return { status: 'failed', reason: '未能确认实验进程已全部退出，请稍后重试。' };
    } finally {
      pendingCloses.delete(scope);
    }
  });

  return async () => {
    stopping = true;
    for (const request of preparing.values()) request.controller.abort();
    preparing.clear();
    const exited = await host.shutdown();
    await Promise.allSettled([...historyWrites, ...grantWrites]);
    if (!exited) stopping = false;
    return exited;
  };
}

async function recordCompletionToHistory(event: ExecutionCompleteEvent, plan: ExecutionPlan): Promise<void> {
  try {
    const db = DesktopDatabaseService.getPackageDb(plan.packageDir);
    await recordExperimentAttempt({
      packageDir: plan.packageDir,
      attempt: {
        attemptId: event.executionId,
        labId: plan.labId,
        chapterId: plan.chapterId,
        status: event.status === 'passed' ? 'passed' : 'failed',
        timestamp: new Date().toISOString(),
        durationMs: event.durationMs,
        steps: event.steps,
        error: event.reason
      },
      db
    });
  } catch {
    // History write failures must never crash the main process
  }
}
