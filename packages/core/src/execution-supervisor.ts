import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type {
  ExecutionPlan,
  ExecutionPlanError
} from '@learnlab/core-types';
import type { Result } from '@learnlab/core-types';

/**
 * Validates an ExecutionPlan before the host spawns anything.
 * Pure function: no I/O, no side effects.
 */
export function validateExecutionPlan(
  plan: unknown,
  trustedPackageDirs: Set<string>
): Result<ExecutionPlan, ExecutionPlanError> {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return { ok: false, error: { type: 'invalid_plan', message: '执行计划必须是对象' } };
  }
  const p = plan as Record<string, unknown>;

  for (const key of ['executionId', 'labId', 'chapterId', 'pluginId', 'packageDir', 'experimentType']) {
    if (typeof p[key] !== 'string' || !(p[key] as string).trim()) {
      return { ok: false, error: { type: 'invalid_plan', message: `${key} 必须是非空字符串` } };
    }
  }

  // executionId must not contain path separators or null bytes
  const executionId = p.executionId as string;
  if (executionId.includes('/') || executionId.includes('\\') || executionId.includes('\0')) {
    return { ok: false, error: { type: 'invalid_plan', message: 'executionId 不能包含路径分隔符' } };
  }

  const packageDir = path.resolve(p.packageDir as string);
  if (!trustedPackageDirs.has(packageDir)) {
    return { ok: false, error: { type: 'package_not_trusted', message: `实验包目录未登记为受信任：${packageDir}` } };
  }

  if (p.timeoutMs !== undefined) {
    if (typeof p.timeoutMs !== 'number' || !Number.isFinite(p.timeoutMs) || p.timeoutMs <= 0) {
      return { ok: false, error: { type: 'invalid_plan', message: 'timeoutMs 必须是正整数' } };
    }
    if (p.timeoutMs > 300_000) {
      return { ok: false, error: { type: 'invalid_plan', message: 'timeoutMs 不能超过 300000 ms（5 分钟）' } };
    }
  }

  const validated: ExecutionPlan = {
    executionId,
    labId: p.labId as string,
    chapterId: p.chapterId as string,
    pluginId: p.pluginId as string,
    packageDir,
    experimentType: p.experimentType as string,
    input: typeof p.input === 'string' ? p.input : undefined,
    timeoutMs: typeof p.timeoutMs === 'number' ? p.timeoutMs : 30_000
  };

  return { ok: true, value: validated };
}

/**
 * Locates the runnable entry point for a plugin.
 * Returns the absolute path to the plugin's runtime entry if found.
 */
export function resolvePluginEntrypoint(
  pluginsDir: string,
  pluginId: string
): Result<string, ExecutionPlanError> {
  if (!pluginId || pluginId.includes('/') || pluginId.includes('\\') || pluginId.includes('\0')) {
    return { ok: false, error: { type: 'plugin_not_found', message: `插件 ID 不合法：${pluginId}` } };
  }

  const pluginDir = path.join(path.resolve(pluginsDir), pluginId);
  // Convention: plugins/plugin-mysql/runtime/index.js (built artifact)
  // Falls back to src/index.js for development plugins
  const candidates = [
    path.join(pluginDir, 'runtime', 'index.js'),
    path.join(pluginDir, 'dist', 'index.js'),
    path.join(pluginDir, 'src', 'index.js')
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { ok: true, value: candidate };
    }
  }

  return {
    ok: false,
    error: {
      type: 'plugin_missing_entrypoint',
      message: `插件 ${pluginId} 没有可执行的入口文件（已检查 runtime/dist/src 目录）`
    }
  };
}

/**
 * Builds the sanitized environment for a plugin child process.
 * Only passes through variables explicitly allowed; never leaks tokens or keys.
 */
export function buildPluginEnv(
  packageDir: string,
  plan: Pick<ExecutionPlan, 'labId' | 'experimentType' | 'executionId'>
): NodeJS.ProcessEnv {
  return {
    // Let Node resolve its own paths
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    // Plugin context — no arbitrary env passthrough
    LEARNLAB_PACKAGE_DIR: packageDir,
    LEARNLAB_LAB_ID: plan.labId,
    LEARNLAB_EXPERIMENT_TYPE: plan.experimentType,
    LEARNLAB_EXECUTION_ID: plan.executionId
  };
}
