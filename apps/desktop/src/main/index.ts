import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { loadPackage, readChapter } from '@learnlab/core';

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

  if (process.env.ELECTRON_RENDERER_URL) await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('package:example-dir', () => join(app.getAppPath(), '../../examples/packages/sql-intro'));
  ipcMain.handle('package:load', (_event, packageDir: string) => loadPackage(packageDir));
  ipcMain.handle('package:read-chapter', (_event, packageDir: string, chapterFile: string) => readChapter(packageDir, chapterFile));

  void createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
