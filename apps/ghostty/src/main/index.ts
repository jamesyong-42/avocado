/**
 * Electron main entry for the Ghostty-parity showcase.
 *
 * One window styled like Ghostty on macOS (transparent-feel titlebar via
 * hiddenInset, terminal-colored background). The application menu
 * deliberately does NOT claim cmd+T / cmd+W / cmd+D — those are surface
 * bindings handled in the renderer, matching Ghostty's keybind model.
 */

import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TerminalHost } from './terminal-host.js';
import { registerIpcHandlers } from './ipc-handlers.js';

// ESM-safe __dirname (electron-vite emits ESM for the main process).
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Ghostty Default Style Dark background. */
const GHOSTTY_BG = '#282c34';

const host = new TerminalHost();
let mainWindow: BrowserWindow | null = null;

function buildMenu(): Menu {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } satisfies MenuItemConstructorOptions] : []),
    // Edit roles give the terminal native cmd+C / cmd+V copy-paste.
    { role: 'editMenu' },
    { role: 'viewMenu' },
    // windowMenu has minimize/zoom but no Close item — cmd+W stays free
    // for the renderer's close-surface binding.
    { role: 'windowMenu' },
  ];
  return Menu.buildFromTemplate(template);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 980,
    height: 640,
    minWidth: 400,
    minHeight: 300,
    backgroundColor: GHOSTTY_BG,
    title: 'ghostty (avocado)',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  mainWindow = createWindow();
  registerIpcHandlers(host, () => mainWindow);

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

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  host.dispose();
});
