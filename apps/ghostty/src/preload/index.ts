/**
 * Preload bridge — exposes `window.ghostty` (a `TerminalBackend`-shaped
 * object) and `window.ghosttyInfo` (static platform facts) to the renderer.
 *
 * Runs with contextIsolation: true. Only `electron` and the shared IPC
 * contract are imported.
 */

import { basename } from 'node:path';
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { TerminalBackend } from '@vibecook/avocado-sdk/types';

import {
  IPC,
  type GhosttyAppInfo,
  type IPCPtySession,
  type IPCTerminalInfo,
  type Unsubscribe,
} from '@shared/ipc';

function subscribe<TArgs extends unknown[]>(
  channel: string,
  cb: (...args: TArgs) => void
): Unsubscribe {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => {
    cb(...(args as TArgs));
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const backend: TerminalBackend = {
  pty: {
    create: (options: { cwd: string; cols: number; rows: number }) =>
      ipcRenderer.invoke(IPC.PTY_CREATE, options) as Promise<{
        success: boolean;
        sessionId?: string;
        error?: string;
      }>,
    destroy: (sessionId: string) =>
      ipcRenderer.invoke(IPC.PTY_DESTROY, sessionId) as Promise<{
        success: boolean;
        error?: string;
      }>,
    list: () =>
      ipcRenderer.invoke(IPC.PTY_LIST) as Promise<{
        success: boolean;
        sessions?: IPCPtySession[];
        error?: string;
      }>,
    write: (sessionId: string, data: string) =>
      ipcRenderer.invoke(IPC.PTY_WRITE, sessionId, data) as Promise<void>,
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC.PTY_RESIZE, sessionId, cols, rows) as Promise<{
        success: boolean;
        error?: string;
      }>,
    onOutput: (cb: (terminalId: string, sessionId: string, base64Data: string) => void) =>
      subscribe<[string, string, string]>(IPC.EVT_PTY_OUTPUT, cb),
    onExit: (cb: (sessionId: string, exitCode: number) => void) =>
      subscribe<[string, number]>(IPC.EVT_PTY_EXIT, cb),
  },
  terminal: {
    createVirtual: (sessionId: string, options: { cols: number; rows: number; mode: string }) =>
      ipcRenderer.invoke(IPC.TERMINAL_CREATE_VIRTUAL, sessionId, options) as Promise<{
        success: boolean;
        terminalId?: string;
        error?: string;
      }>,
    // This app never creates headless terminals; satisfy the contract.
    createHeadless: async () => ({
      success: false,
      error: 'headless terminals are not supported in the ghostty showcase',
    }),
    destroy: (terminalId: string) =>
      ipcRenderer.invoke(IPC.TERMINAL_DESTROY, terminalId) as Promise<{
        success: boolean;
        error?: string;
      }>,
    list: () =>
      ipcRenderer.invoke(IPC.TERMINAL_LIST) as Promise<{
        success: boolean;
        terminals?: IPCTerminalInfo[];
        error?: string;
      }>,
    resize: (terminalId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(IPC.TERMINAL_RESIZE, terminalId, cols, rows) as Promise<{
        success: boolean;
        error?: string;
      }>,
    setActive: (terminalId: string) =>
      ipcRenderer.invoke(IPC.TERMINAL_SET_ACTIVE, terminalId) as Promise<{
        success: boolean;
        error?: string;
      }>,
  },
};

const shellPath =
  process.platform === 'win32'
    ? (process.env['COMSPEC'] ?? 'cmd.exe')
    : (process.env['SHELL'] ?? '/bin/bash');

const info: GhosttyAppInfo = {
  platform: process.platform,
  shellName: basename(shellPath, process.platform === 'win32' ? '.exe' : undefined),
};

contextBridge.exposeInMainWorld('ghostty', backend);
contextBridge.exposeInMainWorld('ghosttyInfo', info);
