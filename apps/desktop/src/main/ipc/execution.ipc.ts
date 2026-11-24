import { ipcMain, type WebContents } from 'electron';
import {
  validateExecutionPlan,
  resolvePluginEntrypoint,
  recordExperimentAttempt
} from '@learnlab/core';
import type { ExecutionCompleteEvent, ExecutionPlan, ExecutionPlanError } from '@learnlab/core-types';
import type { Result } from '@learnlab/core-types';
import { getDefaultPluginsDir } from '../services/paths';
import { getPluginHostService, type PluginHostEvent } from '../services/plugin-host';
import { DesktopDatabaseService } from '../services/database';
import {
  assertTrustedPackage,
  assertTrustedRenderer,
  getTrustedPackageDirs
} from './security';

function sendToRenderer(contents: WebContents, channel: string, data: unknown): void {
  if (!contents.isDestroyed()) contents.send(channel, data);
}

export function registerExecutionIpc(): void {
  const host = getPluginHostService();

  // Forward host events to the renderer that started the execution
  // We track which renderer owns which executionId so we route correctly.
  const ownerMap = new Map<string, WebContents>();

  host.on('event', (event: PluginHostEvent) => {
    const executionId =
      event.type === 'output' ? event.data.executionId : event.data.executionId;
    const contents = ownerMap.get(executionId);
    if (!contents) return;

    if (event.type === 'output') {
      sendToRenderer(contents, 'execution:output', event.data);
    } else {
      sendToRenderer(contents, 'execution:complete', event.data);
      ownerMap.delete(executionId);

      // Auto-record history on completion
      void recordCompletionToHistory(event.data, event.plan);
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

      if (host.isRunning(plan.executionId)) {
        return {
          ok: false,
          error: { type: 'execution_already_running', message: `执行 ${plan.executionId} 已在运行` }
        };
      }

      const entrypoint = resolvePluginEntrypoint(getDefaultPluginsDir(), plan.pluginId);
      if (!entrypoint.ok) return entrypoint;

      ownerMap.set(plan.executionId, ipcEvent.sender);
      host.start(plan, entrypoint.value);
      return { ok: true, value: { executionId: plan.executionId } };
    }
  );

  ipcMain.handle('execution:cancel', (ipcEvent, executionId: string) => {
    assertTrustedRenderer(ipcEvent);
    if (typeof executionId !== 'string' || !executionId.trim()) return;
    host.cancel(executionId);
    ownerMap.delete(executionId);
  });

  ipcMain.handle('execution:is-running', (ipcEvent, executionId: string) => {
    assertTrustedRenderer(ipcEvent);
    return typeof executionId === 'string' && host.isRunning(executionId);
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
