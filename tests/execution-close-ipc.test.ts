import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionPlan } from '@learnlab/core-types';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  showMessageBox: vi.fn(),
  host: { on: vi.fn(), start: vi.fn(), isRunning: vi.fn(), cancel: vi.fn(), shutdown: vi.fn() },
  recordAttempt: vi.fn(),
  prepare: vi.fn(),
  hasGrant: vi.fn(),
  saveGrant: vi.fn()
}));

vi.mock('../apps/desktop/node_modules/electron', () => ({
  ipcMain: { handle: mocks.handle },
  dialog: { showMessageBox: mocks.showMessageBox },
  BrowserWindow: { fromWebContents: () => ({}) }
}));
vi.mock('../apps/desktop/src/main/ipc/security', () => ({
  assertTrustedRenderer: vi.fn(),
  assertPackageInsideTrustedWorkspace: vi.fn(),
  assertTrustedPackage: (_sender: unknown, dir: string) => dir,
  getTrustedPackageDirs: () => new Set(['/workspace/sql', '/workspace/other']),
  requireNonEmptyString: (id: string) => id
}));
vi.mock('../apps/desktop/src/main/services/experiment-launch', () => ({
  prepareExperimentLaunch: mocks.prepare
}));
vi.mock('../apps/desktop/src/main/services/plugin-grants', () => ({
  hasPluginGrant: mocks.hasGrant,
  savePluginGrant: mocks.saveGrant
}));
vi.mock('../apps/desktop/src/main/services/database', () => ({
  DesktopDatabaseService: { getPackageDb: vi.fn() }
}));
vi.mock('../apps/desktop/src/main/services/plugin-host', () => ({
  getPluginHostService: () => mocks.host
}));
vi.mock('../packages/core/src/index', async () => ({
  ...(await vi.importActual<typeof import('../packages/core/src/index')>('../packages/core/src/index')),
  recordExperimentAttempt: mocks.recordAttempt
}));

import { registerExecutionIpc } from '../apps/desktop/src/main/ipc/execution.ipc';

const packageDir = '/workspace/sql';
const plan: ExecutionPlan = {
  executionId: 'attempt-1',
  packageDir,
  labId: 'select',
  chapterId: 'intro',
  pluginId: 'test',
  experimentType: 'query'
};

function createSender() {
  return Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => false });
}

function invoke(channel: string, sender: ReturnType<typeof createSender>, ...args: unknown[]) {
  const handler = mocks.handle.mock.calls.find(([name]) => name === channel)?.[1];
  if (!handler) throw new Error(`IPC handler missing: ${channel}`);
  return handler({ sender }, ...args);
}

const active = new Map<string, ExecutionPlan>();
const preparedLaunch = {
  entrypoint: '/plugins/test.js',
  entrySource: Buffer.from('// authorized entry'),
  grantKey: 'grant-test',
  packageName: 'SQL',
  pluginVersion: '1.0.0',
  experimentTitle: 'Select',
  permissions: { execute: ['plugin.run'] },
  resources: {}
};
const preparedResult = { ok: true, value: preparedLaunch };
let stopExecutions: ReturnType<typeof registerExecutionIpc>;

beforeEach(() => {
  vi.resetAllMocks();
  active.clear();
  mocks.prepare.mockResolvedValue(preparedResult);
  mocks.hasGrant.mockResolvedValue(true);
  mocks.saveGrant.mockResolvedValue(undefined);
  mocks.host.shutdown.mockResolvedValue(true);
  mocks.host.isRunning.mockImplementation((id) => active.has(id));
  mocks.host.start.mockImplementation((executionPlan: ExecutionPlan) => {
    active.set(executionPlan.executionId, executionPlan);
  });
  mocks.host.cancel.mockImplementation(async (id: string) => {
    const executionPlan = active.get(id);
    if (executionPlan) {
      active.delete(id);
      mocks.host.on.mock.calls[0][1]({
        type: 'complete',
        data: { executionId: id, status: 'cancelled', durationMs: 5 },
        plan: executionPlan
      });
    }
    return true;
  });
  stopExecutions = registerExecutionIpc();
});

describe('experiment tab close IPC', () => {
  it('allows closing immediately when there is no owned execution for the experiment', async () => {
    const owner = createSender();
    await invoke('execution:start', owner, plan);
    expect(await invoke('execution:confirm-close', createSender(), packageDir, 'select'))
      .toEqual({ status: 'close' });
    expect(await invoke('execution:confirm-close', owner, packageDir, 'where'))
      .toEqual({ status: 'close' });
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    expect(mocks.host.cancel).not.toHaveBeenCalled();
  });

  it('keeps the tab and execution when the user cancels', async () => {
    const owner = createSender();
    await invoke('execution:start', owner, plan);
    mocks.showMessageBox.mockResolvedValue({ response: 1 });
    expect(await invoke('execution:confirm-close', owner, packageDir, 'select'))
      .toEqual({ status: 'cancelled' });
    expect(mocks.host.cancel).not.toHaveBeenCalled();
    expect(active.has(plan.executionId)).toBe(true);
  });

  it('cleans up only the owned matching run and preserves its completion and history', async () => {
    const owner = createSender();
    await invoke('execution:start', owner, plan);
    await invoke('execution:start', owner, { ...plan, executionId: 'other-lab', labId: 'where' });
    await invoke('execution:start', owner, { ...plan, executionId: 'other-package', packageDir: '/workspace/other' });
    await invoke('execution:start', createSender(), { ...plan, executionId: 'other-owner' });
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    expect(await invoke('execution:confirm-close', owner, packageDir, 'select'))
      .toEqual({ status: 'close' });
    expect(mocks.host.cancel.mock.calls).toEqual([[plan.executionId]]);
    expect(owner.send).toHaveBeenCalledWith('execution:complete', expect.objectContaining({
      executionId: plan.executionId
    }));
    expect(mocks.recordAttempt).toHaveBeenCalledOnce();
    expect([...active.keys()]).toEqual(['other-lab', 'other-package', 'other-owner']);
  });

  it('keeps the tab when the host cannot verify exit', async () => {
    const owner = createSender();
    await invoke('execution:start', owner, plan);
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    mocks.host.cancel.mockResolvedValue(false);
    expect(await invoke('execution:confirm-close', owner, packageDir, 'select'))
      .toEqual(expect.objectContaining({ status: 'failed' }));
    expect(active.has(plan.executionId)).toBe(true);
  });

  it('blocks another run of the same experiment during confirmation', async () => {
    const owner = createSender();
    await invoke('execution:start', owner, plan);
    let decide!: (response: { response: number }) => void;
    mocks.showMessageBox.mockReturnValue(new Promise((resolve) => { decide = resolve; }));
    const closing = invoke('execution:confirm-close', owner, packageDir, 'select');
    expect(await invoke('execution:start', owner, { ...plan, executionId: 'racing-run' }))
      .toMatchObject({ ok: false });
    decide({ response: 1 });
    await closing;
  });

  it('checks all experiments when switching away from a package', async () => {
    const owner = createSender();
    await invoke('execution:start', owner, plan);
    await invoke('execution:start', owner, { ...plan, executionId: 'other-lab', labId: 'where' });
    await invoke('execution:start', owner, { ...plan, executionId: 'other-package', packageDir: '/workspace/other' });
    mocks.showMessageBox.mockResolvedValue({ response: 0 });
    expect(await invoke('execution:confirm-close', owner, packageDir)).toEqual({ status: 'close' });
    expect([...active.keys()]).toEqual(['other-package']);
  });

  it('blocks launches rejected by the main process before creating a child', async () => {
    mocks.prepare.mockResolvedValue({ ok: false, error: { type: 'invalid_plan', message: '实验不匹配' } });
    expect(await invoke('execution:start', createSender(), plan)).toMatchObject({ ok: false });
    expect(mocks.host.start).not.toHaveBeenCalled();
  });

  it('cancels preparation when the matching experiment tab is closed', async () => {
    const owner = createSender();
    let prepared!: () => void;
    mocks.prepare.mockReturnValue(new Promise((resolve) => {
      prepared = () => resolve(preparedResult);
    }));
    const start = invoke('execution:start', owner, plan);
    expect(await invoke('execution:start', owner, { ...plan, executionId: 'concurrent' })).toMatchObject({ ok: false });
    expect(await invoke('execution:confirm-close', owner, packageDir, plan.labId)).toEqual({ status: 'close' });
    prepared();
    expect(await start).toMatchObject({ ok: false, error: { type: 'execution_cancelled' } });
    expect(mocks.showMessageBox).not.toHaveBeenCalled();
    expect(mocks.host.start).not.toHaveBeenCalled();
  });

  it('waits for the owning window to explicitly allow execution', async () => {
    mocks.hasGrant.mockResolvedValue(false);
    const owner = createSender();
    const start = invoke('execution:start', owner, plan);
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledWith(
      'execution:permission-request', expect.objectContaining({ pluginId: plan.pluginId })
    ));
    const request = owner.send.mock.calls[0][1];
    expect(mocks.host.start).not.toHaveBeenCalled();
    expect(await invoke('execution:respond-permission', createSender(), request.requestId, 'once')).toBe(false);
    expect(await invoke('execution:respond-permission', owner, request.requestId, 'once')).toBe(true);
    expect(await start).toMatchObject({ ok: true });
    expect(mocks.saveGrant).not.toHaveBeenCalled();
    expect(mocks.host.start).toHaveBeenCalledWith(
      expect.objectContaining(plan), preparedLaunch.entrypoint, preparedLaunch.entrySource, preparedLaunch.resources
    );
  });

  it('persists an always decision only after revalidating the same installation', async () => {
    mocks.hasGrant.mockResolvedValue(false);
    const owner = createSender();
    const start = invoke('execution:start', owner, plan);
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledOnce());
    const request = owner.send.mock.calls[0][1];
    expect(await invoke('execution:respond-permission', owner, request.requestId, 'always')).toBe(true);
    expect(await invoke('execution:respond-permission', owner, request.requestId, 'always')).toBe(false);
    expect(await start).toMatchObject({ ok: true });
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(mocks.saveGrant).toHaveBeenCalledWith(preparedLaunch.grantKey);
  });

  it('requires a fresh grant if the installation changes while the notification is open', async () => {
    mocks.hasGrant.mockResolvedValue(false);
    const owner = createSender();
    const start = invoke('execution:start', owner, plan);
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledOnce());
    mocks.prepare.mockResolvedValue({ ok: true, value: { ...preparedLaunch, grantKey: 'changed' } });
    const request = owner.send.mock.calls[0][1];
    await invoke('execution:respond-permission', owner, request.requestId, 'always');
    expect(await start).toMatchObject({ ok: false, error: { type: 'permission_unavailable' } });
    expect(mocks.saveGrant).not.toHaveBeenCalled();
    expect(mocks.host.start).not.toHaveBeenCalled();
  });

  it.each(['render-process-gone', 'did-start-navigation'])('withdraws permission on %s', async (event) => {
    mocks.hasGrant.mockResolvedValue(false);
    const owner = createSender();
    const start = invoke('execution:start', owner, plan);
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledOnce());
    owner.emit(event, {}, 'file:///index.html', false, true);
    expect(await start).toMatchObject({ ok: false, error: { type: 'execution_cancelled' } });
    expect(mocks.host.start).not.toHaveBeenCalled();
  });

  it('waits for an in-flight durable grant write when quitting without starting the plugin', async () => {
    mocks.hasGrant.mockResolvedValue(false);
    let finishWrite!: () => void;
    mocks.saveGrant.mockReturnValue(new Promise<void>((resolve) => { finishWrite = resolve; }));
    const owner = createSender();
    const start = invoke('execution:start', owner, plan);
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledOnce());
    const request = owner.send.mock.calls[0][1];
    await invoke('execution:respond-permission', owner, request.requestId, 'always');
    await vi.waitFor(() => expect(mocks.saveGrant).toHaveBeenCalledOnce());

    const quitFinished = vi.fn();
    const quit = stopExecutions().then(quitFinished);
    await new Promise((resolve) => setImmediate(resolve));
    expect(quitFinished).not.toHaveBeenCalled();
    finishWrite();
    await quit;
    expect(quitFinished).toHaveBeenCalledWith(true);
    expect(await start).toMatchObject({ ok: false, error: { type: 'execution_cancelled' } });
    expect(mocks.host.start).not.toHaveBeenCalled();
  });

  it.each(['denied', 'close'] as const)('withdraws an unauthorized launch on %s', async (action) => {
    mocks.hasGrant.mockResolvedValue(false);
    const owner = createSender();
    const start = invoke('execution:start', owner, plan);
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledOnce());
    const request = owner.send.mock.calls[0][1];
    if (action === 'denied') {
      expect(await invoke('execution:respond-permission', owner, request.requestId, 'denied')).toBe(true);
    } else {
      expect(await invoke('execution:confirm-close', owner, packageDir, plan.labId)).toEqual({ status: 'close' });
    }
    expect(await start).toMatchObject({ ok: false });
    expect(owner.send).toHaveBeenCalledWith('execution:permission-closed', request.requestId);
    expect(mocks.host.start).not.toHaveBeenCalled();
  });
});
