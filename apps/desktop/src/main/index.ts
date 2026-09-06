import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { loadPackage, readChapter } from '@learnlab/core';
import { registerWorkspaceIpc } from './ipc/workspace.ipc';
import { registerDependencyIpc } from './ipc/dependency.ipc';
import { registerDatabaseIpc } from './ipc/database.ipc';
import { registerConfigIpc } from './ipc/config.ipc';
import { DesktopDatabaseService } from './services/database';
import {
  assertTrustedPackage,
  assertTrustedRenderer,
  rememberPackage,
  requireNonEmptyString
} from './ipc/security';

let mainWindow: BrowserWindow | null = null;
let appReady = false;
let focusAfterReady = false;
let windowCreation: Promise<void> | null = null;

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    focusAfterReady = true;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function ensureMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return;
  }
  focusAfterReady = true;
  if (!appReady) return;
  if (!windowCreation) {
    windowCreation = createWindow().finally(() => { windowCreation = null; });
  }
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  // Install navigation policies before loading any renderer content so a
  // redirect or window-open request cannot race the initial page load.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.ELECTRON_RENDERER_URL)
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(join(__dirname, '../renderer/index.html'));

  if (focusAfterReady) {
    focusAfterReady = false;
    focusMainWindow();
  }
}

// LearnLab is intentionally a single-instance desktop application. The lock
// must be acquired before app.whenReady() so a second launch never registers
// IPC handlers or creates a competing BrowserWindow.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => ensureMainWindow());

  app.whenReady().then(() => {
    appReady = true;

    ipcMain.handle('package:example-dir', (event) => {
      assertTrustedRenderer(event);
      return join(app.getAppPath(), '../../examples/packages/sql-intro');
    });
    ipcMain.handle('package:load', async (event, packageDir: string) => {
      assertTrustedRenderer(event);
      const result = await loadPackage(requireNonEmptyString(packageDir, 'packageDir'));
      if (result.ok) rememberPackage(result.value.dir);
      return result;
    });
    ipcMain.handle('package:read-chapter', (event, packageDir: string, chapterFile: string) => {
      assertTrustedRenderer(event);
      return readChapter(
        assertTrustedPackage(packageDir),
        requireNonEmptyString(chapterFile, 'chapterFile')
      );
    });
    registerWorkspaceIpc();
    registerDependencyIpc();
    registerDatabaseIpc();
    registerConfigIpc();

    ensureMainWindow();
    app.on('activate', () => ensureMainWindow());
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  DesktopDatabaseService.closeAll();
});
