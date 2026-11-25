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
const BROKER_REQUEST_FD = 3;
const BROKER_RESPONSE_FD = 4;
const MAX_BROKER_REQUESTS = 16;
const MAX_BROKER_REQUEST_BYTES = 4 * 1024;
// Allow a 128 KiB chapter snapshot even when JSON escapes each byte as six characters.
const MAX_BROKER_RESPONSE_BYTES = 1024 * 1024;
const execFileAsync = promisify(execFile);
const RUN_APPROVED_ENTRY = String.raw`
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname } = require('node:path');
const { compileFunction } = require('node:vm');
const filename = process.argv[1];
const source = readFileSync(0, 'utf8').replace(/^#![^\r\n]*/, '');
const entry = { exports: {}, filename };
const run = compileFunction(source, ['exports', 'require', 'module', '__filename', '__dirname'], { filename });
run.call(entry.exports, entry.exports, createRequire(filename), entry, filename, dirname(filename));
`;

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
   * The caller supplies the same entry bytes that were checked for authorization.
   */
  start(
    plan: ExecutionPlan, pluginEntrypoint: string, entrySource: Buffer,
    resources: Readonly<Record<string, unknown>> = {}
  ): void {
    if (this.active.has(plan.executionId)) return;

    const ownsGroup = process.platform !== 'win32';
    const child = spawn(process.execPath, ['--eval', RUN_APPROVED_ENTRY, '--', pluginEntrypoint], {
      cwd: plan.packageDir,
      env: { ...buildPluginEnv(plan.packageDir, plan), ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
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

    this.attachBroker(execution, resources);
    child.stdin?.on('error', () => {
      // Child exit and timeout own outcome reporting.
    });
    child.stdin?.end(entrySource);

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

  private attachBroker(execution: ActiveExecution, resources: Readonly<Record<string, unknown>>): void {
    // spawn's extra 'pipe' descriptors expose duplex streams on the parent side.
    const requestPipe = execution.process.stdio?.[BROKER_REQUEST_FD];
    const responsePipe = execution.process.stdio?.[BROKER_RESPONSE_FD];
    if (!requestPipe || !responsePipe || !('write' in responsePipe)) return;

    const frame = Buffer.alloc(MAX_BROKER_REQUEST_BYTES);
    let frameBytes = 0;
    let requests = 0;

    const fail = (reason: string): void => {
      this.closeBroker(execution.process);
      // Buffered requests may arrive during the bounded drain after a clean exit.
      if (execution.draining && execution.outcome?.status === 'passed') {
        execution.outcome = { ...execution.outcome, status: 'failed', reason };
      }
      void this.finish(execution, 'failed', undefined, reason);
    };

    // Pipe errors can race with child exit. Execution cleanup owns both streams.
    requestPipe.on('error', () => {});
    responsePipe.on('error', () => {});
    requestPipe.on('data', (chunk: Buffer) => {
      if (execution.outcome && !execution.draining) return;
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(0x0a, offset);
        const end = newline === -1 ? chunk.length : newline;
        const bytes = end - offset;
        if (frameBytes + bytes > frame.length) {
          fail('插件宿主请求超过大小限制。');
          return;
        }
        chunk.copy(frame, frameBytes, offset, end);
        frameBytes += bytes;
        if (newline === -1) return;
        offset = newline + 1;

        if (++requests > MAX_BROKER_REQUESTS) {
          fail('插件宿主请求超过限制。');
          return;
        }
        const request = frame.subarray(0, frameBytes);
        frameBytes = 0;
        if (execution.outcome || !responsePipe.writable) continue;

        let message: unknown;
        try {
          message = JSON.parse(request.toString('utf8'));
        } catch {
          continue;
        }
        if (typeof message !== 'object' || message === null) continue;
        const { id, resource } = message as Record<string, unknown>;
        if (!Number.isSafeInteger(id) || typeof resource !== 'string') continue;

        const reply = Object.hasOwn(resources, resource)
          ? { id, ok: true, value: resources[resource] }
          : { id, ok: false, error: 'resource_not_allowed' };
        let line: string;
        try {
          line = JSON.stringify(reply) + '\n';
        } catch {
          fail('插件宿主响应无法编码。');
          return;
        }
        // writableLength counts buffered bytes. Fail before a slow reader can queue more.
        if (responsePipe.writableLength + Buffer.byteLength(line) > MAX_BROKER_RESPONSE_BYTES) {
          fail('插件宿主响应超过大小限制。');
          return;
        }
        responsePipe.write(line);
      }
    });
  }

  private closeBroker(child: ChildProcess): void {
    child.stdio?.[BROKER_REQUEST_FD]?.destroy();
    child.stdio?.[BROKER_RESPONSE_FD]?.destroy();
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

  async shutdown(): Promise<boolean> {
    const results = await Promise.all([...this.active.keys()].map((id) => this.cancel(id)));
    return results.every(Boolean);
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
    if (!execution.draining) this.closeBroker(execution.process);
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
      void this.recheckRemainingGroup(execution);
    }, EXIT_RECHECK_MS).unref();
  }

  private async recheckRemainingGroup(execution: ActiveExecution): Promise<void> {
    const exited = this.hasExited(execution) || await this.linuxGroupHasNoLiveMembers(execution);
    if (execution.cleanup) return;
    if (exited) void this.cleanup(execution);
    else this.recheckExit(execution);
  }

  private async complete(execution: ActiveExecution): Promise<void> {
    // Give queued output a chance to drain on normal exit. A process outside
    // the owned group could still hold a pipe open, so the wait is bounded.
    if (execution.draining) await delay(OUTPUT_DRAIN_MS);
    const exitCode = execution.process.exitCode;
    const outcome = this.recordOutcome(execution, exitCode === 0 ? 'passed' : 'failed', exitCode ?? undefined);
    execution.process.stdout?.destroy();
    execution.process.stderr?.destroy();
    this.closeBroker(execution.process);

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
