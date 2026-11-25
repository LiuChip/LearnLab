import { loadPackage, readChapter, resolvePluginEntrypoint } from '@learnlab/core';
import type { ExecutionPlan, ExecutionPlanError, Result } from '@learnlab/core-types';
import { parseExperimentMarkers } from '@learnlab/markdown';
import { getDefaultPluginsDir } from './paths';
import { resolveInstalledPluginsForPackage } from './plugin-registry';

export async function prepareExperimentLaunch(
  plan: ExecutionPlan
): Promise<Result<string, ExecutionPlanError>> {
  const loaded = await loadPackage(plan.packageDir);
  if (!loaded.ok) {
    return { ok: false, error: { type: 'invalid_plan', message: '无法读取当前实验包。' } };
  }
  const chapter = loaded.value.manifest.chapters.find(({ id }) => id === plan.chapterId);
  if (!chapter) {
    return { ok: false, error: { type: 'invalid_plan', message: '找不到实验所属的章节。' } };
  }

  const markdown = await readChapter(plan.packageDir, chapter.file);
  const experiment = markdown.ok
    ? parseExperimentMarkers(markdown.value).experiments.find(({ id }) => id === plan.labId)
    : undefined;
  if (experiment?.type !== 'auto' || experiment.experimentType !== plan.experimentType) {
    return { ok: false, error: { type: 'invalid_plan', message: '执行请求与当前章节的自动实验声明不匹配。' } };
  }

  const { resolution, installations } = await resolveInstalledPluginsForPackage(
    loaded.value.manifest.required_plugins
  );
  const selected = resolution.active.find((plugin) => plugin.plugin_id === plan.pluginId);
  if (resolution.readOnly || !selected?.provides?.includes(plan.experimentType)) {
    return { ok: false, error: { type: 'plugin_not_allowed', message: '当前实验包无法使用此插件执行该实验。' } };
  }

  const matches = installations.filter(({ manifest }) =>
    manifest.plugin_id === selected.plugin_id && manifest.version === selected.version
  );
  if (matches.length !== 1) {
    return { ok: false, error: { type: 'plugin_not_allowed', message: '存在多个相同版本的插件安装，请清理重复安装。' } };
  }
  return resolvePluginEntrypoint(getDefaultPluginsDir(), matches[0].directoryName);
}
