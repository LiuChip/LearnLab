import { ipcMain } from 'electron';
import { exportSettings, getManualBackupInstructions, importSettings, readConfig, validateConfig, writeConfig } from '@learnlab/core';
import type { AppConfig } from '@learnlab/core-types';
import { getDefaultConfigPath } from '../services/paths';
import { assertTrustedRenderer } from './security';

const defaultConfig: AppConfig = { workspace: {}, plugins: {} };
function requireConfig(value: unknown): AppConfig { if (!validateConfig(value)) throw new TypeError('Invalid application config'); return value; }

export function registerConfigIpc(): void {
  ipcMain.handle('config:read', async (event) => { assertTrustedRenderer(event); return readConfig(getDefaultConfigPath(), defaultConfig); });
  ipcMain.handle('config:write', async (event, config: AppConfig) => { assertTrustedRenderer(event); return writeConfig(getDefaultConfigPath(), requireConfig(config)); });
  ipcMain.handle('config:export-json', async (event, config: AppConfig) => { assertTrustedRenderer(event); return exportSettings(requireConfig(config)); });
  ipcMain.handle('config:import-json', async (event, rawJson: string, currentConfig: AppConfig) => {
    assertTrustedRenderer(event);
    if (typeof rawJson !== 'string') throw new TypeError('rawJson must be a string');
    return importSettings(rawJson, requireConfig(currentConfig));
  });
  ipcMain.handle('config:backup-instructions', async (event) => { assertTrustedRenderer(event); return getManualBackupInstructions(); });
}
