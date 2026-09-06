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

async function createWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Install navigation policies before loading any renderer content so a
  // redirect or window-open request cannot race the initial page load.
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.ELECTRON_RENDERER_URL)
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
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

  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  DesktopDatabaseService.closeAll();
});
