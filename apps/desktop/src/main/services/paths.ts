import { homedir } from 'node:os';
import * as path from 'node:path';

export function getLearnLabHome(): string {
  return process.env.LEARNLAB_HOME || path.join(homedir(), '.learnlab');
}

export function getDefaultWorkspacesDir(): string {
  return path.join(getLearnLabHome(), 'workspaces');
}

export function getDefaultPluginsDir(): string {
  return path.join(getLearnLabHome(), 'plugins');
}

export function getDefaultConfigPath(): string {
  return path.join(getLearnLabHome(), 'config.json');
}
