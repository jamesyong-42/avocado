/**
 * Electron main entry for the avocado playground.
 *
 * Owns the single `BrowserWindow`, the `AvocadoManager` (which in turn owns
 * the truffle node, PTY session manager, terminal service, mesh bridge,
 * sync store, and remote session service), and the IPC bridge to the
 * renderer.
 */

import { app, BrowserWindow, shell } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AvocadoManager } from './avocado-manager.js';
import { registerIpcHandlers } from './ipc-handlers.js';

// ESM-safe __dirname (electron-vite emits ESM for the main process).
const __dirname = dirname(fileURLToPath(import.meta.url));

const manager = new AvocadoManager();
let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      // electron-vite emits the preload as `.mjs` (ESM), not `.js`. Our
      // preload bridge uses contextBridge; sandbox must be false so the
      // `events` module etc. work when imported transitively via type
      // packages. `contextIsolation` stays true.
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // Route target=_blank links through the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // electron-vite sets ELECTRON_RENDERER_URL in dev mode.
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  mainWindow = createWindow();
  registerIpcHandlers(manager, () => mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.on('closed', () => {
        mainWindow = null;
      });
    }
  });
});

// Dev-tool semantics: quit when all windows close, even on macOS.
app.on('window-all-closed', () => {
  app.quit();
});

// Gracefully shut the manager down before exiting. `before-quit` fires before
// windows are destroyed, which gives truffle + PTY a chance to drain cleanly.
let isQuitting = false;
app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  manager
    .stop()
    .catch((err: unknown) => {
      console.error('[main] AvocadoManager.stop() failed:', err);
    })
    .finally(() => {
      app.quit();
    });
});
