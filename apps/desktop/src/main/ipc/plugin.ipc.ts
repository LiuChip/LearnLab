import { ipcMain } from 'electron';
import { loadPackage, readConfig, resolvePlugins } from '@learnlab/core';
import type { AppConfig, PluginResolution } from '@learnlab/core-types';
import { getDefaultConfigPath, getDefaultPluginsDir } from '../services/paths';
import { getDisabledPluginIds, listInstalledPlugins } from '../services/plugin-registry';
import { assertTrustedPackage, assertTrustedRenderer } from './security';

const defaultConfig: AppConfig = { workspace: {}, plugins: {} };

async function readDisabledPluginIds(): Promise<string[]> {
  const config = await readConfig(getDefaultConfigPath(), defaultConfig);
  if (!config.ok) throw new Error(`无法读取插件设置：${config.error.message}`);
  return getDisabledPluginIds(config.value);
}

export function registerPluginIpc(): void {
  ipcMain.handle('plugin:list', async (event) => {
    assertTrustedRenderer(event);
    return listInstalledPlugins(getDefaultPluginsDir());
  });

  ipcMain.handle('plugin:resolve-for-package', async (event, packageDir: string): Promise<PluginResolution> => {
    assertTrustedRenderer(event);
    const trustedPackage = assertTrustedPackage(packageDir);
    const loaded = await loadPackage(trustedPackage);
    if (!loaded.ok) throw new Error(loaded.error.message);
    const installedPlugins = await listInstalledPlugins(getDefaultPluginsDir());
    const disabledPluginIds = await readDisabledPluginIds();
    return resolvePlugins({
      installedPlugins,
      packageRequirements: loaded.value.manifest.required_plugins,
      disabledPluginIds
    });
  });
}
