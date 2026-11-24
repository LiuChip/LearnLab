import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type {
  ExecutionCompleteEvent,
  ExecutionOutputEvent,
  ExecutionPlan
} from '@learnlab/core-types';
import { buildPluginEnv } from '@learnlab/core';

interface ActiveExecution {
  plan: ExecutionPlan;
  process: ChildProcess;
  startedAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
  stdout: string[];
  stderr: string[];
}

export type PluginHostEvent =
  | { type: 'output'; data: ExecutionOutputEvent }
  | { type: 'complete'; data: ExecutionCompleteEvent };

/**
 * Manages plugin child processes for experiment execution.
 * One instance per app; tracks active executions by executionId.
 * The main process creates this once and registers IPC against it.
 */
export class PluginHostService extends EventEmitter {
  private readonly active = new Map<string, ActiveExecution>();
  private readonly MAX_OUTPUT_BYTES = 256 * 1024; // 256 KB per stream

  /**
   * Launches a plugin process for the given plan.
   * The entrypoint must already be validated by the caller.
   */
  start(plan: ExecutionPlan, pluginEntrypoint: string): void {
    if (this.active.has(plan.executionId)) return;

    const env = buildPluginEnv(plan.packageDir, plan);
    const child = spawn(process.execPath, [pluginEntrypoint], {
      cwd: plan.packageDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Spawn in a new process group so we can kill the whole tree on timeout/cancel
      detached: false
    });

    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const timeoutMs = plan.timeoutMs ?? 30_000;
    const timeoutHandle = setTimeout(() => {
      this._finish(plan.executionId, 'timeout');
    }, timeoutMs);

    const execution: ActiveExecution = {
      plan,
      process: child,
      startedAt: Date.now(),
      timeoutHandle,
      stdout: stdoutChunks,
      stderr: stderrChunks
    };
    this.active.set(plan.executionId, execution);

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stdoutBytes += Buffer.byteLength(text);
      if (stdoutBytes > this.MAX_OUTPUT_BYTES) {
        this._finish(plan.executionId, 'failed', undefined, '输出超过大小限制（256 KB）');
        return;
      }
      stdoutChunks.push(text);
      this.emit('event', {
        type: 'output',
        data: { executionId: plan.executionId, channel: 'stdout', text }
      } satisfies PluginHostEvent);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      stderrBytes += Buffer.byteLength(text);
      if (stderrBytes > this.MAX_OUTPUT_BYTES) return; // just drop excess stderr
      stderrChunks.push(text);
      this.emit('event', {
        type: 'output',
        data: { executionId: plan.executionId, channel: 'stderr', text }
      } satisfies PluginHostEvent);
    });

    child.on('error', (err) => {
      this._finish(plan.executionId, 'failed', undefined, err.message);
    });

    child.on('close', (code) => {
      if (!this.active.has(plan.executionId)) return; // already finished
      const status = code === 0 ? 'passed' : 'failed';
      this._finish(plan.executionId, status, code ?? undefined);
    });
  }

  cancel(executionId: string): void {
    if (!this.active.has(executionId)) return;
    this._finish(executionId, 'cancelled');
  }

  isRunning(executionId: string): boolean {
    return this.active.has(executionId);
  }

  cancelAllForPackage(packageDir: string): void {
    for (const [id, execution] of this.active) {
      if (execution.plan.packageDir === packageDir) {
        this._finish(id, 'cancelled');
      }
    }
  }

  private _finish(
    executionId: string,
    status: ExecutionCompleteEvent['status'],
    exitCode?: number,
    reason?: string
  ): void {
    const execution = this.active.get(executionId);
    if (!execution) return;

    clearTimeout(execution.timeoutHandle);
    this.active.delete(executionId);

    // Kill the process if still alive
    if (!execution.process.killed) {
      try {
        execution.process.kill('SIGTERM');
        // On macOS/Linux give it a moment, then SIGKILL
        setTimeout(() => {
          if (!execution.process.killed) {
            try { execution.process.kill('SIGKILL'); } catch { /* already dead */ }
          }
        }, 1500);
      } catch { /* already dead */ }
    }

    const durationMs = Date.now() - execution.startedAt;

    // Try to parse structured JSON result from stdout (last line)
    let steps: ExecutionCompleteEvent['steps'];
    const lastLine = execution.stdout.join('').trim().split('\n').pop() ?? '';
    try {
      const parsed = JSON.parse(lastLine) as { steps?: unknown };
      if (Array.isArray(parsed.steps)) {
        steps = parsed.steps as ExecutionCompleteEvent['steps'];
      }
    } catch { /* stdout was plain text, not JSON */ }

    const complete: ExecutionCompleteEvent = {
      executionId,
      status,
      exitCode,
      durationMs,
      steps,
      reason: reason ?? (status === 'timeout' ? `超时（${execution.plan.timeoutMs ?? 30_000} ms）` : undefined)
    };

    this.emit('event', { type: 'complete', data: complete } satisfies PluginHostEvent);
  }
}

// Singleton — created once in index.ts, re-used across IPC handlers
let _instance: PluginHostService | null = null;

export function getPluginHostService(): PluginHostService {
  if (!_instance) _instance = new PluginHostService();
  return _instance;
}
