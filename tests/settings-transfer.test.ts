import { describe, expect, it } from 'vitest';
import {
  CURRENT_SETTINGS_SCHEMA_VERSION,
  exportSettings,
  getManualBackupInstructions,
  importSettings,
  redactSecrets
} from '../packages/core/src';
import type { AppConfig } from '@learnlab/core-types';

describe('settings transfer and backup specifications', () => {
  const sampleConfig: AppConfig = {
    workspace: {
      lastOpenedPackage: '/path/to/pkg'
    },
    plugins: {
      'org.learnlab.mysql': {
        enabled: true,
        port: 3306,
        user: 'root',
        password: 'SUPER_SECRET_PASSWORD',
        apiKey: 'SECRET_API_KEY_123',
        nested: {
          token: 'BEARER_SECRET_TOKEN',
          displayMode: 'compact'
        }
      },
      'org.learnlab.vim': {
        enabled: true,
        useCtrlKeys: false
      }
    },
    variables: {
      defaultTheme: 'dark',
      auth_token: 'ANOTHER_SECRET'
    }
  };

  it('redacts sensitive credentials on export', () => {
    const exportedRaw = exportSettings(sampleConfig);
    const envelope = JSON.parse(exportedRaw);

    expect(envelope.schemaVersion).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(envelope.exportedAt).toBeDefined();

    // Verify non-sensitive settings are preserved
    expect(envelope.settings.workspace.lastOpenedPackage).toBe('/path/to/pkg');
    expect(envelope.settings.plugins['org.learnlab.mysql'].port).toBe(3306);
    expect(envelope.settings.plugins['org.learnlab.mysql'].nested.displayMode).toBe('compact');
    expect(envelope.settings.plugins['org.learnlab.vim'].enabled).toBe(true);

    // Verify secrets are redacted and NOT in exported JSON
    expect(envelope.settings.plugins['org.learnlab.mysql'].password).toBeUndefined();
    expect(envelope.settings.plugins['org.learnlab.mysql'].apiKey).toBeUndefined();
    expect(envelope.settings.plugins['org.learnlab.mysql'].nested.token).toBeUndefined();
    expect(envelope.settings.variables.auth_token).toBeUndefined();
    expect(exportedRaw).not.toContain('SUPER_SECRET_PASSWORD');
    expect(exportedRaw).not.toContain('SECRET_API_KEY_123');
    expect(exportedRaw).not.toContain('BEARER_SECRET_TOKEN');
  });

  it('directly redacts sensitive fields in arbitrary object trees', () => {
    const raw = {
      apiKey: 'key1',
      token: 'tok1',
      nested: { password: 'pass', name: 'LearnLab' },
      list: [{ secret: 'shh' }, { normal: 42 }]
    };
    const sanitized = redactSecrets(raw) as Record<string, unknown>;
    expect(sanitized.apiKey).toBeUndefined();
    expect(sanitized.token).toBeUndefined();
    expect((sanitized.nested as Record<string, unknown>).password).toBeUndefined();
    expect((sanitized.nested as Record<string, unknown>).name).toBe('LearnLab');
    expect((sanitized.list as Record<string, unknown>[])[0].secret).toBeUndefined();
    expect((sanitized.list as Record<string, unknown>[])[1].normal).toBe(42);
  });

  it('imports valid settings and merges with existing configuration', () => {
    const currentConfig: AppConfig = {
      workspace: {
        lastOpenedPackage: '/local/existing'
      },
      plugins: {
        'org.learnlab.mysql': {
          enabled: true,
          password: 'LOCAL_PASSWORD_TO_KEEP'
        }
      }
    };

    const exportedRaw = exportSettings(sampleConfig);
    const result = importSettings(exportedRaw, currentConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const merged = result.value;
      // Imported workspace updated
      expect(merged.workspace.lastOpenedPackage).toBe('/path/to/pkg');
      // Imported non-sensitive plugin settings applied
      expect(merged.plugins['org.learnlab.mysql'].port).toBe(3306);
      expect(merged.plugins['org.learnlab.vim'].enabled).toBe(true);
      // Local credentials not overwritten!
      expect(merged.plugins['org.learnlab.mysql'].password).toBe('LOCAL_PASSWORD_TO_KEEP');
    }
  });

  it('rejects invalid JSON without modifying configuration', () => {
    const currentConfig: AppConfig = { workspace: {}, plugins: {} };
    const result = importSettings('{ invalid json: ...', currentConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('invalid_json');
    }
  });

  it('rejects unsupported schema version and preserves existing configuration', () => {
    const currentConfig: AppConfig = {
      workspace: { lastOpenedPackage: '/keep/me' },
      plugins: {}
    };

    const invalidEnvelope = {
      schemaVersion: 999, // Future unsupported version
      exportedAt: new Date().toISOString(),
      settings: {
        workspace: { lastOpenedPackage: '/evil/override' },
        plugins: {}
      }
    };

    const result = importSettings(JSON.stringify(invalidEnvelope), currentConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('unsupported_schema_version');
      expect(result.error.message).toContain('999');
    }
    // Existing config remains intact
    expect(currentConfig.workspace.lastOpenedPackage).toBe('/keep/me');
  });

  it('provides comprehensive manual backup and migration instructions', () => {
    const guide = getManualBackupInstructions();
    expect(guide).toContain('~/.learnlab/config.json');
    expect(guide).toContain('workspace.db');
    expect(guide).toContain('package.db');
    expect(guide).toContain('dependencies/');
    expect(guide).toContain('experiment_history');
  });
});
