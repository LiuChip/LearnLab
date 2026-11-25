import { ipcMain } from 'electron';
import { loadPackage } from '@learnlab/core';
import type { PluginResolution } from '@learnlab/core-types';
import { getDefaultPluginsDir } from '../services/paths';
import { listInstalledPlugins, resolveInstalledPluginsForPackage } from '../services/plugin-registry';
import { assertTrustedPackage, assertTrustedRenderer } from './security';

export function registerPluginIpc(): void {
  ipcMain.handle('plugin:list', async (event) => {
    assertTrustedRenderer(event);
    return listInstalledPlugins(getDefaultPluginsDir());
  });

  ipcMain.handle('plugin:resolve-for-package', async (event, packageDir: string): Promise<PluginResolution> => {
    assertTrustedRenderer(event);
    const trustedPackage = assertTrustedPackage(event.sender, packageDir);
    const loaded = await loadPackage(trustedPackage);
    if (!loaded.ok) throw new Error(loaded.error.message);
    const { resolution } = await resolveInstalledPluginsForPackage(loaded.value.manifest.required_plugins);
    return resolution;
  });
}
