import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionPlan } from '@learnlab/core-types';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  showMessageBox: vi.fn(),
  host: { on: vi.fn(), start: vi.fn(), isRunning: vi.fn(), cancel: vi.fn() },
  recordAttempt: vi.fn()
}));

vi.mock('../apps/desktop/node_modules/electron', () => ({
  ipcMain: { handle: mocks.handle },
  dialog: { showMessageBox: mocks.showMessageBox },
  BrowserWindow: { fromWebContents: () => ({}) }
}));
vi.mock('../apps/desktop/src/main/ipc/security', () => ({
  assertTrustedRenderer: vi.fn(),
  assertTrustedPackage: (_sender: unknown, dir: string) => dir,
  getTrustedPackageDirs: () => new Set(['/workspace/sql', '/workspace/other']),
  requireNonEmptyString: (id: string) => id
}));
vi.mock('../apps/desktop/src/main/services/paths', () => ({ getDefaultPluginsDir: () => '/plugins' }));
vi.mock('../apps/desktop/src/main/services/database', () => ({
  DesktopDatabaseService: { getPackageDb: vi.fn() }
}));
vi.mock('../apps/desktop/src/main/services/plugin-host', () => ({
  getPluginHostService: () => mocks.host
}));
vi.mock('../packages/core/src/index', async () => ({
  ...(await vi.importActual<typeof import('../packages/core/src/index')>('../packages/core/src/index')),
  resolvePluginEntrypoint: () => ({ ok: true, value: '/plugins/test.js' }),
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

beforeEach(() => {
  vi.resetAllMocks();
  active.clear();
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
  registerExecutionIpc();
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
});
