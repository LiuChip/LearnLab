import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ExecutionPlan } from '../packages/core-types/src/execution';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginHostService, type PluginHostEvent } from '../apps/desktop/src/main/services/plugin-host';

const onPosix = it.skipIf(process.platform === 'win32');
const fixtureDirs: string[] = [];
const signal = process.kill.bind(process);

afterEach(async () => {
  vi.restoreAllMocks();
  for (const dir of fixtureDirs.splice(0)) {
    for (const name of ['worker.pid', 'plugin.pid']) {
      const pid = Number(await readFile(join(dir, name), 'utf8').catch(() => ''));
      if (pid <= 0) continue;
      try {
        signal(pid, 'SIGKILL');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    await rm(dir, { recursive: true, force: true });
  }
});

async function startPlugin(source: string, timeoutMs = 2500) {
  const packageDir = await mkdtemp(join(tmpdir(), 'learnlab-plugin-host-'));
  fixtureDirs.push(packageDir);
  const entrypoint = join(packageDir, 'plugin.cjs');
  const approvedSource = Buffer.from(`
    const fs = require('node:fs');
    fs.writeFileSync('plugin.pid', String(process.pid));
    ${source}
  `);
  await writeFile(entrypoint, approvedSource);
  const plan: ExecutionPlan = {
    executionId: 'execution-1',
    labId: 'lab',
    chapterId: 'chapter',
    pluginId: 'plugin-fixture',
    packageDir,
    experimentType: 'fixture',
    timeoutMs
  };
  const host = new PluginHostService();
  const events: PluginHostEvent[] = [];
  host.on('event', (event: PluginHostEvent) => events.push(event));
  host.start(plan, entrypoint, approvedSource);
  return {
    host,
    id: plan.executionId,
    events,
    completions: () => events.flatMap(event => event.type === 'complete' ? [event.data] : []),
    pid: async (name = 'plugin') => vi.waitFor(async () => {
      const pid = Number(await readFile(join(packageDir, `${name}.pid`), 'utf8'));
      expect(pid).toBeGreaterThan(0);
      return pid;
    })
  };
}

const ignoreTerm = `
  process.on('SIGTERM', () => console.log('ignored TERM'));
  console.log('ready');
  setInterval(() => {}, 1000);
`;

function expectGone(pid: number) {
  expect(() => signal(pid, 0)).toThrow(/ESRCH/);
}

describe('PluginHostService', () => {
  it('runs the project-owned fixture with an allowed resource and denies other reads', async () => {
    const packageDir = await mkdtemp(join(tmpdir(), 'learnlab-plugin-scope-'));
    fixtureDirs.push(packageDir);
    const host = new PluginHostService();
    const completed = vi.fn();
    host.on('event', (event: PluginHostEvent) => {
      if (event.type === 'complete') completed(event.data);
    });
    const entrypoint = resolve('plugins/plugin-host-check/runtime/index.js');
    host.start({
      executionId: 'host-check', labId: 'check', chapterId: 'intro',
      pluginId: 'org.learnlab.host-check', packageDir, experimentType: 'host-check'
    }, entrypoint, await readFile(entrypoint), {
      'package.manifest': { id: 'fixture', name: 'Fixture', version: '1.0.0' }
    });
    try {
      await vi.waitFor(() => expect(completed).toHaveBeenCalledWith(expect.objectContaining({
        status: 'passed',
        steps: [
          { name: '读取已授权的包摘要', status: 'passed' },
          { name: '拒绝读取未授权的章节', status: 'passed' }
        ]
      })));
    } finally {
      await host.shutdown();
    }
  });

  it('rejects an oversized broker request before its newline arrives', async () => {
    const fixture = await startPlugin(`
      fs.writeSync(3, '{"id":1,"resource":"' + '界'.repeat(700));
      setTimeout(() => fs.writeSync(3, '界'.repeat(700)), 30);
      setInterval(() => {}, 1000);
    `);
    try {
      await vi.waitFor(() => expect(fixture.completions()).toMatchObject([
        { status: 'failed', reason: '插件宿主请求超过大小限制。' }
      ]));
      expect(fixture.host.isRunning(fixture.id)).toBe(false);
    } finally {
      await fixture.host.shutdown();
    }
  });

  it('recovers after a plugin process crashes and accepts the next execution', async () => {
    const fixture = await startPlugin('throw new Error("fixture crash")');
    await vi.waitFor(() => expect(fixture.completions()).toMatchObject([{ status: 'failed', exitCode: 1 }]));
    expect(fixture.host.isRunning(fixture.id)).toBe(false);
    const event = fixture.events.find((entry) => entry.type === 'complete');
    if (!event || event.type !== 'complete') throw new Error('Expected completion event');
    const entry = join(event.plan.packageDir, 'restart.cjs');
    await writeFile(entry, 'throw new Error("unapproved replacement");');
    fixture.host.start({ ...event.plan, executionId: 'next' }, entry, Buffer.from('console.log("recovered");'));
    await vi.waitFor(() => expect(fixture.completions()).toMatchObject([
      { status: 'failed' }, { status: 'passed', executionId: 'next' }
    ]));
  });

  it('confirms cancellation for an absent execution', async () => {
    expect(await new PluginHostService().cancel('absent')).toBe(true);
  });

  onPosix('shares cancellation until a TERM-resistant execution has exited', async () => {
    const fixture = await startPlugin(ignoreTerm);
    const { host, id, completions, events } = fixture;
    await vi.waitFor(() => expect(events).toContainEqual({
      type: 'output', data: { executionId: id, channel: 'stdout', text: 'ready\n' }
    }));
    const pid = await fixture.pid();

    const first = host.cancel(id);
    expect(host.cancel(id)).toBe(first);
    expect(host.isRunning(id)).toBe(true);
    expect(completions()).toEqual([]);

    expect(await first).toBe(true);
    expectGone(pid);
    expectGone(-pid);
    expect(host.isRunning(id)).toBe(false);
    expect(completions()).toMatchObject([{ status: 'cancelled' }]);
  });

  onPosix('cleans the owned group after normal exit even when a worker inherits stdout', async () => {
    const steps = [{ name: 'fixture', status: 'passed' }];
    const fixture = await startPlugin(`
      const { spawn } = require('node:child_process');
      const worker = spawn(process.execPath, ['-e', ${JSON.stringify(`
        require('node:fs').writeFileSync('worker.pid', String(process.pid));
        setTimeout(() => {}, 10_000);
      `)}], { stdio: 'inherit' });
      worker.unref();
      const waitForWorker = setInterval(() => {
        if (!fs.existsSync('worker.pid')) return;
        clearInterval(waitForWorker);
        console.log(JSON.stringify({ steps: ${JSON.stringify(steps)} }));
      }, 10);
    `);
    const pid = await fixture.pid();
    const worker = await fixture.pid('worker');

    await vi.waitFor(() => expect(fixture.completions()).toMatchObject([
      { status: 'passed', exitCode: 0, steps }
    ]));
    if (process.platform === 'linux') {
      const status = execFileSync('/bin/ps', ['-eo', 'pid=,stat='], { encoding: 'utf8' })
        .split('\n').map((line) => line.trim().split(/\s+/))
        .find(([processId]) => Number(processId) === worker)?.[1];
      if (status) expect(status).toMatch(/^Z/);
    } else {
      expectGone(worker);
      expectGone(-pid);
    }
    expect(fixture.host.isRunning(fixture.id)).toBe(false);
  });

  onPosix.each([
    ['timeout', '', '超时（250 ms）'],
    ['failed', `process.stdout.write('x'.repeat(300 * 1024));`, '输出超过大小限制（256 KB）']
  ] as const)('confirms exit before emitting %s', async (status, output, reason) => {
    const fixture = await startPlugin(`${ignoreTerm}\n${output}`, status === 'timeout' ? 250 : 2500);
    const pid = await fixture.pid();

    await vi.waitFor(() => expect(fixture.completions()).toMatchObject([{ status, reason }]), {
      timeout: 2500
    });
    expectGone(pid);
    expectGone(-pid);
    expect(fixture.host.isRunning(fixture.id)).toBe(false);
  });

  onPosix('retains an execution after bounded cleanup fails and publishes its eventual exit', async () => {
    const fixture = await startPlugin(ignoreTerm);
    const pid = await fixture.pid();
    const kill = vi.spyOn(process, 'kill').mockImplementation((target, command) => {
      if (target === -pid && command !== 0) {
        throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
      }
      return signal(target, command);
    });

    expect(await fixture.host.cancel(fixture.id)).toBe(false);
    expect(fixture.host.isRunning(fixture.id)).toBe(true);
    expect(fixture.completions()).toEqual([]);
    expect(kill).toHaveBeenCalledWith(-pid, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith(-pid, 'SIGKILL');

    kill.mockRestore();
    signal(-pid, 'SIGKILL');
    await vi.waitFor(() => expect(fixture.completions()).toMatchObject([{ status: 'cancelled' }]));
    expect(fixture.host.isRunning(fixture.id)).toBe(false);
  });
});
