import { readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { loadPluginManifest } from '@learnlab/core';
import type { AppConfig, PluginManifest } from '@learnlab/core-types';

export function getDisabledPluginIds(config: AppConfig): string[] {
  return Object.entries(config.plugins)
    .filter(([, settings]) => settings.enabled === false)
    .map(([pluginId]) => pluginId);
}

export async function listInstalledPlugins(pluginDir: string): Promise<PluginManifest[]> {
  let entries;
  try {
    entries = await readdir(pluginDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const plugins: PluginManifest[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const result = await loadPluginManifest(path.join(pluginDir, entry.name, 'manifest.yaml'));
    if (result.ok) plugins.push(result.value);
  }
  return plugins;
}
