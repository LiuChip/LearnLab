import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import {
  calculateBufferSha256, loadPackage, readChapter, resolvePermissions, resolvePluginEntrypoint
} from '@learnlab/core';
import type { ExecutionPlan, ExecutionPlanError, PluginPermissions, Result } from '@learnlab/core-types';
import { parseExperimentMarkers } from '@learnlab/markdown';
import { getDefaultPluginsDir } from './paths';
import { resolveInstalledPluginsForPackage } from './plugin-registry';
import { createPluginGrantKey } from './plugin-grants';

const CHAPTER_LIMIT_BYTES = 128 * 1024;
const ENTRY_LIMIT_BYTES = 8 * 1024 * 1024;

export interface PreparedExperimentLaunch {
  entrypoint: string;
  entrySource: Buffer;
  grantKey: string;
  packageName: string;
  pluginVersion: string;
  experimentTitle: string;
  permissions: PluginPermissions;
  resources: Readonly<Partial<Record<'package.manifest' | 'package.chapter', unknown>>>;
}

export async function prepareExperimentLaunch(
  plan: ExecutionPlan
): Promise<Result<PreparedExperimentLaunch, ExecutionPlanError>> {
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
  const entry = await resolvePluginEntrypoint(getDefaultPluginsDir(), matches[0].directoryName);
  if (!entry.ok) return entry;
  const entrySource = await readEntrySnapshot(entry.value).catch(() => undefined);
  if (!entrySource) {
    return { ok: false, error: { type: 'plugin_missing_entrypoint', message: '无法读取插件入口，或入口文件超过 8 MiB。' } };
  }

  const { manifest } = loaded.value;
  const resources = {
    'package.manifest': { id: manifest.id, name: manifest.name, version: manifest.version },
    ...(markdown.ok && Buffer.byteLength(markdown.value) <= CHAPTER_LIMIT_BYTES && {
      'package.chapter': { id: chapter.id, text: markdown.value }
    })
  };
  const supported = { read: Object.keys(resources) };
  const eligible = resolvePermissions({
    declared: selected.permissions ?? {},
    requestedByPackage: { read: experiment.requestedRead ?? [] },
    grantedByUser: supported,
    hostCapabilities: supported
  });
  const read = [...eligible.read].sort();
  const permissions = { read, execute: ['plugin.run'] };
  const grantKey = createPluginGrantKey([
    'plugin-run-v1', await realpath(plan.packageDir), manifest.id, manifest.version,
    selected, entry.value, calculateBufferSha256(entrySource), permissions
  ]);
  return {
    ok: true,
    value: {
      entrypoint: entry.value, entrySource, grantKey, packageName: manifest.name, pluginVersion: selected.version,
      experimentTitle: experiment.title, permissions,
      resources: Object.fromEntries(Object.entries(resources).filter(([key]) => eligible.read.has(key)))
    }
  };
}

async function readEntrySnapshot(entrypoint: string): Promise<Buffer | undefined> {
  const file = await open(entrypoint, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > ENTRY_LIMIT_BYTES) return undefined;
    const source = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < source.length) {
      const { bytesRead } = await file.read(source, offset, source.length - offset);
      if (bytesRead === 0) return source.subarray(0, offset);
      offset += bytesRead;
    }
    // A concurrent write grew the entry. Requiring a retry avoids accepting a partial program.
    return undefined;
  } finally {
    await file.close();
  }
}
