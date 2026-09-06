import type { AppConfig, Result } from '@learnlab/core-types';
import { validateConfig } from './config-store';

export const CURRENT_SETTINGS_SCHEMA_VERSION = 1;

export interface ExportedSettingsEnvelope {
  schemaVersion: number;
  exportedAt: string;
  learnlabVersion: string;
  settings: AppConfig;
}

export interface SettingsTransferError {
  type: 'invalid_json' | 'unsupported_schema_version' | 'missing_settings' | 'invalid_shape';
  message: string;
}

const SENSITIVE_KEY_REGEX = /api[_-]?key|secret|token|password|passwd|auth[_-]?header/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        // Redact sensitive secrets from export
        continue;
      }
      output[key] = redactSecrets(val);
    }
    return output;
  }
  return value;
}

export function exportSettings(config: AppConfig, learnlabVersion = '0.1.0'): string {
  const sanitizedConfig = redactSecrets(config) as AppConfig;
  const envelope: ExportedSettingsEnvelope = {
    schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    learnlabVersion,
    settings: sanitizedConfig
  };
  return JSON.stringify(envelope, null, 2);
}

export function importSettings(
  rawJson: string,
  currentConfig: AppConfig
): Result<AppConfig, SettingsTransferError> {
  if (typeof rawJson !== 'string' || !validateConfig(currentConfig)) {
    return { ok: false, error: { type: 'invalid_shape', message: 'Settings input has an invalid runtime shape' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    const cause = err as Error;
    return {
      ok: false,
      error: {
        type: 'invalid_json',
        message: `Failed to parse settings JSON: ${cause.message}`
      }
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      error: {
        type: 'missing_settings',
        message: 'Settings file must be a JSON object'
      }
    };
  }

  const envelope = parsed as Partial<ExportedSettingsEnvelope>;

  if (envelope.schemaVersion === undefined || typeof envelope.schemaVersion !== 'number') {
    return {
      ok: false,
      error: {
        type: 'unsupported_schema_version',
        message: 'Missing or invalid schemaVersion in settings file'
      }
    };
  }

  if (envelope.schemaVersion > CURRENT_SETTINGS_SCHEMA_VERSION || envelope.schemaVersion < 1) {
    return {
      ok: false,
      error: {
        type: 'unsupported_schema_version',
        message: `Unsupported schema version: ${envelope.schemaVersion} (supported: ${CURRENT_SETTINGS_SCHEMA_VERSION})`
      }
    };
  }

  if (!envelope.settings || typeof envelope.settings !== 'object') {
    return {
      ok: false,
      error: {
        type: 'missing_settings',
        message: 'Missing settings payload in imported file'
      }
    };
  }

  const importedSettings = envelope.settings;
  if (!validateConfig(importedSettings) || !validateConfig(currentConfig)) {
    return { ok: false, error: { type: 'invalid_shape', message: 'Settings contain an invalid nested structure' } };
  }

  // Merge safely with current config without destroying un-exported credentials
  const merged: AppConfig = {
    workspace: {
      ...currentConfig.workspace,
      ...(importedSettings.workspace || {})
    },
    plugins: {},
    variables: {
      ...(currentConfig.variables || {}),
      ...(importedSettings.variables || {})
    }
  };

  // Merge plugin settings
  const allPluginKeys = new Set([
    ...Object.keys(currentConfig.plugins || {}),
    ...Object.keys(importedSettings.plugins || {})
  ]);

  for (const pluginId of allPluginKeys) {
    const curPlugin = currentConfig.plugins?.[pluginId] || {};
    const impPlugin = importedSettings.plugins?.[pluginId] || {};
    merged.plugins[pluginId] = {
      ...curPlugin,
      ...impPlugin
    };
  }

  return {
    ok: true,
    value: merged
  };
}

export function getManualBackupInstructions(): string {
  return `# LearnLab 手动备份与迁移指引

LearnLab 采用本地优先架构，不设置云端强绑定与黑盒快照系统。用户可以通过文件复制完整备份或迁移学习状态。

## 1. 备份全局设置
- 文件路径：\`~/.learnlab/config.json\`
- 备份方法：直接复制该文件，或在软件中执行“导出设置 JSON”。
- 说明：导出的 JSON 包含插件设置与用户偏好，密钥类字段已安全脱敏。

## 2. 备份学习区
- 目录路径：用户指定的学习区根目录（例如 \`~/LearnLabWorkspace/\`）
- 关键内容：
  - \`workspace.db\`：包注册、软连接与依赖引用记录；
  - \`dependencies/\`：共享独立运行时；
  - 各实验包目录：包括包内 \`package.db\`（阅读进度和章节索引）及 \`experiment_history/\`（实验历史）。
- 备份方法：直接复制整个学习区文件夹到备份盘或新设备。

## 3. 恢复与迁移
1. 将备份的学习区文件夹复制到新机器；
2. 启动 LearnLab，选择该学习区目录打开；
3. 如需恢复自定义插件偏好，导入此前导出的设置 JSON。
`;
}
