import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron';
import {
  validateExecutionPlan,
  resolvePluginEntrypoint,
  recordExperimentAttempt
} from '@learnlab/core';
import type {
  ExecutionCompleteEvent,
  ExecutionPlan,
  ExecutionPlanError,
  ExperimentCloseResult
} from '@learnlab/core-types';
import type { Result } from '@learnlab/core-types';
import { getDefaultPluginsDir } from '../services/paths';
import { getPluginHostService, type PluginHostEvent } from '../services/plugin-host';
import { DesktopDatabaseService } from '../services/database';
import {
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

export function registerExecutionIpc(): void {
  const host = getPluginHostService();

  // Forward host events to the renderer that started the execution
  // We track which renderer owns which executionId so we route correctly.
  const ownerMap = new Map<string, { sender: WebContents; plan: ExecutionPlan }>();
  const pendingCloses = new Set<CloseScope>();

  host.on('event', (event: PluginHostEvent) => {
    const { executionId } = event.data;
    const owner = ownerMap.get(executionId);
    if (!owner) return;

    if (event.type === 'output') {
      sendToRenderer(owner.sender, 'execution:output', event.data);
    } else {
      ownerMap.delete(executionId);
      void recordCompletionToHistory(event.data, event.plan).then(() => {
        sendToRenderer(owner.sender, 'execution:complete', event.data);
      });
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

      // Re-validate the package dir via the standard trusted-package check
      assertTrustedPackage(ipcEvent.sender, plan.packageDir);

      if ([...pendingCloses].some((scope) => matchesScope(scope, ipcEvent.sender, plan))) {
        return { ok: false, error: { type: 'execution_already_running', message: '正在处理实验标签关闭' } };
      }

      const activeScope = { sender: ipcEvent.sender, packageDir: plan.packageDir, labId: plan.labId };
      if (host.isRunning(plan.executionId) || [...ownerMap.values()].some(
        (owner) => matchesScope(activeScope, owner.sender, owner.plan)
      )) {
        return {
          ok: false,
          error: { type: 'execution_already_running', message: '实验已有执行正在运行或退出' }
        };
      }

      const entrypoint = resolvePluginEntrypoint(getDefaultPluginsDir(), plan.pluginId);
      if (!entrypoint.ok) return entrypoint;

      ownerMap.set(plan.executionId, { sender: ipcEvent.sender, plan });
      try {
        host.start(plan, entrypoint.value);
      } catch (error) {
        ownerMap.delete(plan.executionId);
        throw error;
      }
      return { ok: true, value: { executionId: plan.executionId } };
    }
  );

  ipcMain.handle('execution:cancel', async (ipcEvent, executionId: string) => {
    assertTrustedRenderer(ipcEvent);
    if (typeof executionId !== 'string' || ownerMap.get(executionId)?.sender !== ipcEvent.sender) return;
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

    const executions = [...ownerMap.entries()]
      .filter(([, owner]) => matchesScope(scope, owner.sender, owner.plan));
    if (executions.length === 0) return { status: 'close' };

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

      const stopped = await Promise.all(executions.map(([id, owner]) =>
        ownerMap.get(id) === owner ? host.cancel(id) : true
      ));
      if (stopped.every(Boolean)) return { status: 'close' };
      return { status: 'failed', reason: '未能确认实验进程已全部退出，请稍后重试。' };
    } finally {
      pendingCloses.delete(scope);
    }
  });
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
