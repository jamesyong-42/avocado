/**
 * IPC handler registration — wires the TerminalBackend-shaped channels to
 * the TerminalHost and forwards host events to the renderer.
 */

import { ipcMain, type BrowserWindow } from 'electron';

import { IPC, type IPCPtySession, type IPCTerminalInfo } from '@shared/ipc';
import type { TerminalHost } from './terminal-host.js';

export function registerIpcHandlers(
  host: TerminalHost,
  getMainWindow: () => BrowserWindow | null
): void {
  // ─── PTY (renderer → main) ─────────────────────────────────────────────

  ipcMain.handle(
    IPC.PTY_CREATE,
    async (
      _event,
      options: { cwd: string; cols: number; rows: number }
    ): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
      try {
        const { sessionId } = host.createSession(options);
        return { success: true, sessionId };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.PTY_DESTROY,
    async (_event, sessionId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const ok = host.destroySession(sessionId);
        return ok
          ? { success: true }
          : { success: false, error: 'session not found or not running' };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.PTY_LIST,
    async (): Promise<{ success: boolean; sessions?: IPCPtySession[]; error?: string }> => {
      try {
        return { success: true, sessions: host.listSessions() };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(IPC.PTY_WRITE, async (_event, sessionId: string, data: string): Promise<void> => {
    host.write(sessionId, data);
  });

  ipcMain.handle(
    IPC.PTY_RESIZE,
    async (
      _event,
      sessionId: string,
      cols: number,
      rows: number
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const ok = host.resizeSession(sessionId, cols, rows);
        return ok
          ? { success: true }
          : { success: false, error: 'session not found or not running' };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  // ─── Terminals (renderer → main) ───────────────────────────────────────

  ipcMain.handle(
    IPC.TERMINAL_CREATE_VIRTUAL,
    async (
      _event,
      sessionId: string,
      options: { cols: number; rows: number; mode: string }
    ): Promise<{ success: boolean; terminalId?: string; error?: string }> => {
      try {
        const terminalId = host.createVirtualTerminal(sessionId, options);
        return { success: true, terminalId };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.TERMINAL_DESTROY,
    async (_event, terminalId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        host.destroyTerminal(terminalId);
        return { success: true };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.TERMINAL_LIST,
    async (): Promise<{ success: boolean; terminals?: IPCTerminalInfo[]; error?: string }> => {
      try {
        return { success: true, terminals: host.listTerminals() };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.TERMINAL_RESIZE,
    async (
      _event,
      terminalId: string,
      cols: number,
      rows: number
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const ok = host.resizeTerminal(terminalId, cols, rows);
        return ok
          ? { success: true }
          : { success: false, error: 'resize not permitted in current mode' };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.TERMINAL_SET_ACTIVE,
    async (_event, terminalId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        host.setActiveTerminal(terminalId);
        return { success: true };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  // ─── Push events (main → renderer) ─────────────────────────────────────

  const send = <T extends unknown[]>(channel: string, ...args: T): void => {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) return;
    const { webContents } = window;
    if (webContents.isDestroyed()) return;
    webContents.send(channel, ...args);
  };

  host.on('terminalOutput', (evt) => {
    send(
      IPC.EVT_PTY_OUTPUT,
      evt.terminalId,
      evt.sessionId,
      Buffer.from(evt.data, 'utf-8').toString('base64')
    );
  });
  host.on('ptyExit', (sessionId, exitCode) => {
    send(IPC.EVT_PTY_EXIT, sessionId, exitCode);
  });
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
