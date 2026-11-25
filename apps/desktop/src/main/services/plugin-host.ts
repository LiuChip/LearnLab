import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import type {
  ExecutionCompleteEvent,
  ExecutionOutputEvent,
  ExecutionPlan
} from '@learnlab/core-types';
import { buildPluginEnv } from '@learnlab/core';

const TERM_GRACE_MS = 500;
const KILL_GRACE_MS = 1000;
const EXIT_POLL_MS = 20;
const EXIT_RECHECK_MS = 250;
const OUTPUT_DRAIN_MS = 25;
const execFileAsync = promisify(execFile);

type ExecutionOutcome = Pick<ExecutionCompleteEvent, 'status' | 'exitCode' | 'durationMs' | 'reason'>;

interface ActiveExecution {
  plan: ExecutionPlan;
  process: ChildProcess;
  groupId: number | undefined;
  exited: boolean;
  draining: boolean;
  startedAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
  stdout: string[];
  outcome?: ExecutionOutcome;
  cleanup?: Promise<boolean>;
  exitRecheck?: ReturnType<typeof setTimeout>;
}

export type PluginHostEvent =
  | { type: 'output'; data: ExecutionOutputEvent }
  | { type: 'complete'; data: ExecutionCompleteEvent; plan: ExecutionPlan };

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

    const ownsGroup = process.platform !== 'win32';
    const child = spawn(process.execPath, [pluginEntrypoint], {
      cwd: plan.packageDir,
      env: { ...buildPluginEnv(plan.packageDir, plan), ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      // POSIX detached children lead a new process group. Windows tracks only the child.
      detached: ownsGroup
    });

    let stdoutBytes = 0;
    let stderrBytes = 0;

    const timeoutMs = plan.timeoutMs ?? 30_000;
    const execution: ActiveExecution = {
      plan,
      process: child,
      groupId: ownsGroup ? child.pid : undefined,
      exited: false,
      draining: false,
      startedAt: Date.now(),
      timeoutHandle: setTimeout(() => {
        void this.finish(execution, 'timeout', undefined, `超时（${timeoutMs} ms）`);
      }, timeoutMs),
      stdout: []
    };
    this.active.set(plan.executionId, execution);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (execution.outcome && !execution.draining) return;
      const text = chunk.toString('utf8');
      stdoutBytes += Buffer.byteLength(text);
      if (stdoutBytes > this.MAX_OUTPUT_BYTES) {
        void this.finish(execution, 'failed', undefined, '输出超过大小限制（256 KB）');
        return;
      }
      execution.stdout.push(text);
      this.emit('event', {
        type: 'output',
        data: { executionId: plan.executionId, channel: 'stdout', text }
      } satisfies PluginHostEvent);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (execution.outcome && !execution.draining) return;
      const text = chunk.toString('utf8');
      stderrBytes += Buffer.byteLength(text);
      if (stderrBytes > this.MAX_OUTPUT_BYTES) return; // just drop excess stderr
      this.emit('event', {
        type: 'output',
        data: { executionId: plan.executionId, channel: 'stderr', text }
      } satisfies PluginHostEvent);
    });

    child.on('error', (err) => {
      if (!execution.outcome) void this.finish(execution, 'failed', undefined, err.message);
    });

    child.once('exit', (code) => {
      execution.exited = true;
      execution.draining = !execution.outcome;
      this.recordOutcome(execution, code === 0 ? 'passed' : 'failed', code ?? undefined);
      // Descendants can keep the inherited pipes open after the child exits.
      void this.cleanup(execution);
    });

    child.once('close', (code) => {
      execution.draining = false;
      this.recordOutcome(execution, code === 0 ? 'passed' : 'failed', code ?? undefined);
      if (!execution.exited) {
        // A spawn failure closes the streams without an exit event.
        execution.exited = true;
        void this.cleanup(execution);
      }
    });
  }

  cancel(executionId: string): Promise<boolean> {
    const execution = this.active.get(executionId);
    return execution ? this.finish(execution, 'cancelled') : Promise.resolve(true);
  }

  isRunning(executionId: string): boolean {
    return this.active.has(executionId);
  }

  cancelAllForPackage(packageDir: string): void {
    for (const execution of this.active.values()) {
      if (execution.plan.packageDir === packageDir) {
        void this.finish(execution, 'cancelled');
      }
    }
  }

  private finish(
    execution: ActiveExecution,
    status: ExecutionCompleteEvent['status'],
    exitCode?: number,
    reason?: string
  ): Promise<boolean> {
    this.recordOutcome(execution, status, exitCode, reason);
    return this.cleanup(execution);
  }

  private recordOutcome(
    execution: ActiveExecution,
    status: ExecutionCompleteEvent['status'],
    exitCode?: number,
    reason?: string
  ): ExecutionOutcome {
    return execution.outcome ??= { status, exitCode, reason, durationMs: Date.now() - execution.startedAt };
  }

  private cleanup(execution: ActiveExecution): Promise<boolean> {
    if (execution.cleanup) return execution.cleanup;
    clearTimeout(execution.timeoutHandle);
    clearTimeout(execution.exitRecheck);
    // Assign the shared promise before signaling, which can trigger child events.
    execution.cleanup = Promise.resolve().then(async () => {
      if (!(await this.terminate(execution))) {
        execution.cleanup = undefined;
        this.recheckExit(execution);
        return false;
      }
      await this.complete(execution);
      return true;
    });
    return execution.cleanup;
  }

  private async terminate(execution: ActiveExecution): Promise<boolean> {
    if (this.hasExited(execution)) return true;
    this.signal(execution, 'SIGTERM');
    if (await this.waitForExit(execution, TERM_GRACE_MS)) return true;
    this.signal(execution, 'SIGKILL');
    return await this.waitForExit(execution, KILL_GRACE_MS) || await this.linuxGroupHasNoLiveMembers(execution);
  }

  private async waitForExit(execution: ActiveExecution, graceMs: number): Promise<boolean> {
    const deadline = performance.now() + graceMs;
    while (!this.hasExited(execution)) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) return false;
      await delay(Math.min(remaining, EXIT_POLL_MS));
    }
    return true;
  }

  private hasExited(execution: ActiveExecution): boolean {
    if (execution.groupId !== undefined) this.signal(execution, 0);
    return execution.exited && execution.groupId === undefined;
  }

  private async linuxGroupHasNoLiveMembers(execution: ActiveExecution): Promise<boolean> {
    const { groupId } = execution;
    if (process.platform !== 'linux' || groupId === undefined || !execution.exited) return false;
    try {
      // A zombie retains its group ID until its parent reaps it, but cannot execute.
      const { stdout } = await execFileAsync('/bin/ps', ['-eo', 'pgid=,stat='], { timeout: 500 });
      const hasLiveMembers = stdout.trim().split('\n').some((line) => {
        const [id, state] = line.trim().split(/\s+/);
        return Number(id) === groupId && !state?.startsWith('Z');
      });
      if (hasLiveMembers) return false;
      execution.groupId = undefined;
      return true;
    } catch {
      return false;
    }
  }

  private signal(execution: ActiveExecution, signal: NodeJS.Signals | 0): void {
    if (execution.groupId !== undefined) {
      try {
        process.kill(-execution.groupId, signal);
      } catch (error) {
        // Once a group disappears, never signal the same numeric ID again.
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') execution.groupId = undefined;
      }
    } else if (process.platform === 'win32' && signal !== 0 && !execution.exited) {
      try {
        execution.process.kill(signal);
      } catch {
        // The exit event still determines whether cleanup succeeded.
      }
    }
  }

  private recheckExit(execution: ActiveExecution): void {
    execution.exitRecheck = setTimeout(() => {
      if (this.hasExited(execution)) void this.cleanup(execution);
      else this.recheckExit(execution);
    }, EXIT_RECHECK_MS).unref();
  }

  private async complete(execution: ActiveExecution): Promise<void> {
    // Give queued output a chance to drain on normal exit. A process outside
    // the owned group could still hold a pipe open, so the wait is bounded.
    if (execution.draining) await delay(OUTPUT_DRAIN_MS);
    const exitCode = execution.process.exitCode;
    const outcome = this.recordOutcome(execution, exitCode === 0 ? 'passed' : 'failed', exitCode ?? undefined);
    execution.process.stdout?.destroy();
    execution.process.stderr?.destroy();

    const executionId = execution.plan.executionId;
    this.active.delete(executionId);

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
      ...outcome,
      steps
    };

    this.emit('event', { type: 'complete', data: complete, plan: execution.plan } satisfies PluginHostEvent);
  }
}

// Singleton — created once in index.ts, re-used across IPC handlers
let _instance: PluginHostService | null = null;

export function getPluginHostService(): PluginHostService {
  if (!_instance) _instance = new PluginHostService();
  return _instance;
}
