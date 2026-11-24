import { BrowserWindow, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import { realpath } from 'node:fs/promises';

interface RendererTrustState {
  workspaces: Set<string>;
  packages: Set<string>;
}

const rendererTrust = new WeakMap<WebContents, RendererTrustState>();

function getTrustState(sender: WebContents): RendererTrustState {
  let state = rendererTrust.get(sender);
  if (!state) {
    state = { workspaces: new Set(), packages: new Set() };
    rendererTrust.set(sender, state);
  }
  return state;
}

function expectedRendererUrl(): string {
  return pathToFileURL(path.join(__dirname, '../renderer/index.html')).href;
}

export function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('IPC request did not originate from the application main frame');
  const frameUrl = event.senderFrame.url;
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  let allowed = frameUrl === expectedRendererUrl();
  if (rendererUrl) {
    try { allowed ||= new URL(frameUrl).origin === new URL(rendererUrl).origin; }
    catch { /* malformed renderer URL is not trusted */ }
  }
  if (!allowed) throw new Error('IPC request originated from an untrusted renderer');
}

export function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) throw new TypeError(`${name} must be a non-empty string without NUL characters`);
  return value;
}

export function rememberWorkspace(sender: WebContents, workspaceDir: string): string {
  const normalized = path.resolve(requireNonEmptyString(workspaceDir, 'workspaceDir'));
  getTrustState(sender).workspaces.add(normalized);
  return normalized;
}
export function assertTrustedWorkspace(sender: WebContents, workspaceDir: string): string {
  const normalized = path.resolve(requireNonEmptyString(workspaceDir, 'workspaceDir'));
  if (!getTrustState(sender).workspaces.has(normalized)) throw new Error('Workspace has not been initialized by this application window');
  return normalized;
}
export function rememberPackage(sender: WebContents, packageDir: string): string {
  const normalized = path.resolve(requireNonEmptyString(packageDir, 'packageDir'));
  getTrustState(sender).packages.add(normalized);
  return normalized;
}
export function assertTrustedPackage(sender: WebContents, packageDir: string): string {
  const normalized = path.resolve(requireNonEmptyString(packageDir, 'packageDir'));
  if (!getTrustState(sender).packages.has(normalized)) throw new Error('Package has not been loaded by this application window');
  return normalized;
}
export function trustedWorkspaceDirs(sender: WebContents): string[] {
  return [...getTrustState(sender).workspaces];
}

/**
 * A package may be opened only when its real path lies inside a workspace this
 * window initialised. The renderer's claim about a path is never enough.
 */
export async function assertPackageInsideTrustedWorkspace(
  sender: WebContents,
  packageDir: string
): Promise<string> {
  const normalized = path.resolve(requireNonEmptyString(packageDir, 'packageDir'));
  const [realPackage, ...realWorkspaces] = await Promise.all([
    realpath(normalized).catch(() => normalized),
    ...trustedWorkspaceDirs(sender).map((dir) => realpath(dir).catch(() => dir))
  ]);
  const inside = realWorkspaces.some((workspace) => {
    const relative = path.relative(workspace, realPackage);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  if (!inside) throw new Error('Package is not inside a workspace opened by this application window');
  return normalized;
}

export function requireIdentifier(value: unknown, name: string): string {
  const identifier = requireNonEmptyString(value, name);
  if (identifier === '.' || identifier === '..' || identifier.includes('/') || identifier.includes('\\')) throw new TypeError(`${name} must be a safe identifier`);
  return identifier;
}

export function getTrustedPackageDirs(sender: WebContents): Set<string> {
  return new Set(getTrustState(sender).packages);
}
