import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { loadPluginManifest, readConfig, resolvePlugins, resolveSafeExistingPath } from '@learnlab/core';
import type { AppConfig, PluginManifest, PluginRequirement } from '@learnlab/core-types';
import { getDefaultConfigPath, getDefaultPluginsDir } from './paths';

interface PluginInstallation {
  directoryName: string;
  manifest: PluginManifest;
}

export function getDisabledPluginIds(config: AppConfig): string[] {
  return Object.entries(config.plugins)
    .filter(([, settings]) => settings.enabled === false)
    .map(([pluginId]) => pluginId);
}

export async function listInstalledPlugins(pluginDir: string): Promise<PluginManifest[]> {
  return (await listInstallations(pluginDir)).map(({ manifest }) => manifest);
}

async function listInstallations(pluginDir: string): Promise<PluginInstallation[]> {
  let entries;
  try {
    entries = await readdir(pluginDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const plugins: PluginInstallation[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const manifestPath = await resolveSafeExistingPath(
      path.join(pluginDir, entry.name), 'manifest.yaml', pluginDir
    );
    if (!manifestPath) continue;
    const result = await loadPluginManifest(manifestPath);
    if (result.ok) plugins.push({ directoryName: entry.name, manifest: result.value });
  }
  return plugins;
}

export async function resolveInstalledPluginsForPackage(requirements?: PluginRequirement[]) {
  const [installations, config] = await Promise.all([
    listInstallations(getDefaultPluginsDir()),
    readConfig(getDefaultConfigPath(), { workspace: {}, plugins: {} })
  ]);
  if (!config.ok) throw new Error(`无法读取插件设置：${config.error.message}`);
  const resolution = resolvePlugins({
    installedPlugins: installations.map(({ manifest }) => manifest),
    packageRequirements: requirements,
    disabledPluginIds: getDisabledPluginIds(config.value)
  });
  return { resolution, installations };
}
