import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionPlan } from '@learnlab/core-types';
import { prepareExperimentLaunch } from '../apps/desktop/src/main/services/experiment-launch';

let root: string;
let plan: ExecutionPlan;

vi.mock('../apps/desktop/src/main/services/paths', () => ({
  getDefaultPluginsDir: () => join(root, 'plugins'),
  getDefaultConfigPath: () => join(root, 'config.json')
}));

async function makePlugin(directory: string, id: string, version: string, type = 'query', entry = true) {
  const install = join(root, 'plugins', directory);
  await mkdir(join(install, 'runtime'), { recursive: true });
  await writeFile(join(install, 'manifest.yaml'),
    `plugin_id: ${id}\nversion: ${version}\nprovides: [${type}]\n`);
  const entrypoint = join(install, 'runtime', 'index.js');
  if (entry) await writeFile(entrypoint, '// test fixture');
  return entrypoint;
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'learnlab-launch-')));
  const packageDir = join(root, 'lesson');
  await mkdir(join(packageDir, 'chapters'), { recursive: true });
  await writeFile(join(packageDir, 'manifest.yaml'), `
id: lesson
name: SQL lesson
version: 1.0.0
author: LearnLab
chapters:
  - id: intro
    title: Introduction
    file: intro.md
required_plugins:
  - id: org.example.sql
    version: ^1.0.0
`);
  await writeFile(join(packageDir, 'chapters', 'intro.md'), [
    '```lab', 'id: select', 'type: auto', 'experiment_type: query', '```',
    '```lab', 'id: manual', 'type: manual', '```'
  ].join('\n'));
  plan = {
    executionId: 'attempt', labId: 'select', chapterId: 'intro',
    pluginId: 'org.example.sql', packageDir, experimentType: 'query'
  };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('main process experiment launch preparation', () => {
  it('uses the compatible installation from the registered manifest', async () => {
    const expected = await makePlugin('sql-1', plan.pluginId, '1.1.0');
    await makePlugin(plan.pluginId, plan.pluginId, '2.0.0');
    await expect(prepareExperimentLaunch(plan)).resolves.toEqual({ ok: true, value: expected });
  });

  it.each([{ labId: 'missing' }, { labId: 'manual' }, { chapterId: 'missing' }, { experimentType: 'other' }])(
    'rejects a run that does not match the chapter declaration %j',
    async (override) => {
      await makePlugin('sql', plan.pluginId, '1.1.0');
      await expect(prepareExperimentLaunch({ ...plan, ...override })).resolves.toMatchObject({
        ok: false, error: { type: 'invalid_plan' }
      });
    }
  );

  it('rejects installed plugins outside the active dependency set', async () => {
    await makePlugin('sql', plan.pluginId, '1.1.0');
    await makePlugin('other', 'org.example.other', '1.0.0');
    await expect(prepareExperimentLaunch({ ...plan, pluginId: 'org.example.other' })).resolves
      .toMatchObject({ ok: false, error: { type: 'plugin_not_allowed' } });
  });

  it('applies the latest disabled setting before launch', async () => {
    await makePlugin('sql', plan.pluginId, '1.1.0');
    await writeFile(join(root, 'config.json'), JSON.stringify({
      workspace: {}, plugins: { [plan.pluginId]: { enabled: false } }
    }));
    await expect(prepareExperimentLaunch(plan)).resolves
      .toMatchObject({ ok: false, error: { type: 'plugin_not_allowed' } });
  });

  it('requires the selected plugin to provide the experiment type', async () => {
    await makePlugin('sql', plan.pluginId, '1.1.0', 'schema');
    await expect(prepareExperimentLaunch(plan)).resolves
      .toMatchObject({ ok: false, error: { type: 'plugin_not_allowed' } });
  });

  it('rejects ambiguous installations for the selected version', async () => {
    await makePlugin('sql-first', plan.pluginId, '1.1.0');
    await makePlugin('sql-second', plan.pluginId, '1.1.0');
    await expect(prepareExperimentLaunch(plan)).resolves
      .toMatchObject({ ok: false, error: { type: 'plugin_not_allowed' } });
  });

  it.skipIf(process.platform === 'win32')('requires the entrypoint to remain in its installation', async () => {
    const entry = await makePlugin('sql', plan.pluginId, '1.1.0', 'query', false);
    const otherEntry = await makePlugin('other', 'org.example.other', '1.0.0');
    await symlink(otherEntry, entry);
    await expect(prepareExperimentLaunch(plan)).resolves
      .toMatchObject({ ok: false, error: { type: 'plugin_missing_entrypoint' } });
  });
});
