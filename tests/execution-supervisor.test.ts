import { describe, expect, it } from 'vitest';
import { validateExecutionPlan, buildPluginEnv, resolvePluginEntrypoint } from '../packages/core/src/execution-supervisor';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('validateExecutionPlan', () => {
  const basePlan = {
    executionId: 'exec-001',
    labId: 'select-all',
    chapterId: 'chapter-01',
    pluginId: 'plugin-mysql',
    packageDir: '/trusted/pkg',
    experimentType: 'query'
  };
  const trusted = new Set(['/trusted/pkg']);

  it('accepts a valid plan', () => {
    const result = validateExecutionPlan(basePlan, trusted);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-object plan', () => {
    const result = validateExecutionPlan('bad', trusted);
    expect(result.ok).toBe(false);
  });

  it('rejects a plan with missing required fields', () => {
    const { labId: _, ...missing } = basePlan;
    const result = validateExecutionPlan(missing, trusted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('invalid_plan');
  });

  it('rejects an untrusted packageDir', () => {
    const result = validateExecutionPlan({ ...basePlan, packageDir: '/other/pkg' }, trusted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('package_not_trusted');
  });

  it('rejects executionId with path separators', () => {
    const result = validateExecutionPlan({ ...basePlan, executionId: '../bad' }, trusted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('invalid_plan');
  });

  it('rejects timeoutMs over 300000', () => {
    const result = validateExecutionPlan({ ...basePlan, timeoutMs: 400_000 }, trusted);
    expect(result.ok).toBe(false);
  });

  it('defaults timeoutMs to 30000 when omitted', () => {
    const result = validateExecutionPlan(basePlan, trusted);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.timeoutMs).toBe(30_000);
  });
});

describe('resolvePluginEntrypoint', () => {
  it('finds runtime/index.js', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-plugin-'));
    try {
      const pluginDir = path.join(dir, 'plugin-test', 'runtime');
      await mkdir(pluginDir, { recursive: true });
      await writeFile(path.join(pluginDir, 'index.js'), '// stub');
      const result = resolvePluginEntrypoint(dir, 'plugin-test');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toContain(path.join('plugin-test', 'runtime', 'index.js'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns plugin_missing_entrypoint when no entry exists', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'learnlab-plugin-'));
    try {
      const result = resolvePluginEntrypoint(dir, 'plugin-nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe('plugin_missing_entrypoint');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects plugin_id with path separators', () => {
    const result = resolvePluginEntrypoint('/plugins', '../escape');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('plugin_not_found');
  });
});

describe('buildPluginEnv', () => {
  it('exposes LEARNLAB_* env vars and withholds others', () => {
    const env = buildPluginEnv('/pkg/sql-intro', {
      executionId: 'exec-1',
      labId: 'lab-1',
      experimentType: 'query'
    });
    expect(env.LEARNLAB_PACKAGE_DIR).toBe('/pkg/sql-intro');
    expect(env.LEARNLAB_LAB_ID).toBe('lab-1');
    expect(env.LEARNLAB_EXPERIMENT_TYPE).toBe('query');
    expect(env.LEARNLAB_EXECUTION_ID).toBe('exec-1');
    // No arbitrary secret passthrough
    expect(Object.keys(env).filter((k) => !k.startsWith('LEARNLAB_') && !['PATH', 'HOME', 'TMPDIR'].includes(k))).toHaveLength(0);
  });
});
