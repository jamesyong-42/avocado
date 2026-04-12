/**
 * IPC handler registration.
 *
 * Wires every `ipcMain.handle(...)` channel to an `AvocadoManager` method
 * and forwards every manager event to the renderer via
 * `webContents.send(...)`. The contract lives in `@shared/ipc`.
 *
 * The `getMainWindow` callback is a closure over the current window so we
 * tolerate window recreation without holding a stale reference.
 */

import { ipcMain, type BrowserWindow } from 'electron';

import {
  IPC,
  type IPCPtySession,
  type IPCTerminalInfo,
  type NodeStatusEvent,
  type PeerInfo,
} from '@shared/ipc';

import type { AvocadoManager } from './avocado-manager.js';

export function registerIpcHandlers(
  manager: AvocadoManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // ─── Invoke handlers (renderer → main) ────────────────────────────────────

  // Lifecycle
  ipcMain.handle(
    IPC.LIFECYCLE_START,
    async (): Promise<NodeStatusEvent> => manager.start()
  );
  ipcMain.handle(IPC.LIFECYCLE_STOP, async (): Promise<void> => {
    await manager.stop();
  });
  ipcMain.handle(
    IPC.LIFECYCLE_GET_STATUS,
    (): NodeStatusEvent => manager.getStatusEvent()
  );

  ipcMain.handle(
    IPC.LIFECYCLE_OPEN_AUTH_URL,
    async (_event: unknown, url: string): Promise<void> => {
      const { shell } = await import('electron');
      await shell.openExternal(url);
    }
  );

  // Peers
  ipcMain.handle(
    IPC.PEERS_LIST,
    async (): Promise<PeerInfo[]> => manager.listPeers()
  );

  // PTY
  ipcMain.handle(
    IPC.PTY_CREATE,
    async (
      _event,
      options: { cwd: string; cols: number; rows: number }
    ): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
      try {
        const { sessionId } = manager.spawnLocalSession(options);
        return { success: true, sessionId };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.PTY_DESTROY,
    async (
      _event,
      sessionId: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const ok = manager.destroySession(sessionId);
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
    async (): Promise<{
      success: boolean;
      sessions?: IPCPtySession[];
      error?: string;
    }> => {
      try {
        return { success: true, sessions: manager.listSessions() };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.PTY_WRITE,
    async (_event, sessionId: string, data: string): Promise<void> => {
      manager.writeToSession(sessionId, data);
    }
  );

  ipcMain.handle(
    IPC.PTY_RESIZE,
    async (
      _event,
      sessionId: string,
      cols: number,
      rows: number
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const ok = manager.resizeSession(sessionId, cols, rows);
        return ok
          ? { success: true }
          : { success: false, error: 'session not found or not running' };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  // Terminal
  ipcMain.handle(
    IPC.TERMINAL_CREATE_VIRTUAL,
    async (
      _event,
      sessionId: string,
      options: { cols: number; rows: number; mode: string }
    ): Promise<{ success: boolean; terminalId?: string; error?: string }> => {
      try {
        const terminalId = manager.createVirtualTerminal(sessionId, options);
        return { success: true, terminalId };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.TERMINAL_CREATE_HEADLESS,
    async (): Promise<{
      success: boolean;
      terminalId?: string;
      error?: string;
    }> => {
      // Risk 4: TerminalServiceImpl only implements createVirtualTerminal.
      // Headless support is out of scope for playground v0.1. Fail fast so
      // the renderer sees an explicit error instead of a silent hang.
      return {
        success: false,
        error: 'headless terminals not implemented in playground v0.1',
      };
    }
  );

  ipcMain.handle(
    IPC.TERMINAL_DESTROY,
    async (
      _event,
      terminalId: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        manager.destroyTerminal(terminalId);
        return { success: true };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  ipcMain.handle(
    IPC.TERMINAL_LIST,
    async (): Promise<{
      success: boolean;
      terminals?: IPCTerminalInfo[];
      error?: string;
    }> => {
      try {
        return { success: true, terminals: manager.listTerminals() };
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
        const ok = manager.resizeTerminal(terminalId, cols, rows);
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
    async (
      _event,
      terminalId: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        manager.setActiveTerminal(terminalId);
        return { success: true };
      } catch (err) {
        return { success: false, error: toErrorMessage(err) };
      }
    }
  );

  // ─── Push events (main → renderer) ────────────────────────────────────────

  const send = <T extends unknown[]>(channel: string, ...args: T): void => {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) return;
    const { webContents } = window;
    if (webContents.isDestroyed()) return;
    webContents.send(channel, ...args);
  };

  manager.on('statusChanged', (event) => {
    send(IPC.EVT_STATUS_CHANGED, event);
  });
  manager.on('authRequired', (url) => {
    send(IPC.EVT_AUTH_REQUIRED, url);
  });
  manager.on('peersChanged', (peers) => {
    send(IPC.EVT_PEERS_CHANGED, peers);
  });

  // Route terminal output through TerminalServiceImpl so each event
  // carries the correct terminalId. useTerminalCore in the renderer
  // matches on terminalId — sending '' (empty) would never match.
  manager.on('terminalOutput', (evt) => {
    send(
      IPC.EVT_PTY_OUTPUT,
      evt.terminalId,
      evt.sessionId,
      Buffer.from(evt.data, 'utf-8').toString('base64')
    );
  });
  manager.on('ptyExit', (sessionId, exitCode) => {
    send(IPC.EVT_PTY_EXIT, sessionId, exitCode);
  });
  manager.on('ptySessionDiscovered', (data) => {
    send(IPC.EVT_PTY_SESSION_DISCOVERED, data);
  });
  manager.on('ptySessionLost', (data) => {
    send(IPC.EVT_PTY_SESSION_LOST, data);
  });
  manager.on('ptySessionResized', (data) => {
    send(
      IPC.EVT_PTY_SESSION_RESIZED,
      data.sessionId,
      data.cols,
      data.rows,
      data.source,
      data.origin
    );
  });

  manager.on('terminalDestroyed', (terminalId, sessionId) => {
    send(IPC.EVT_TERMINAL_DESTROYED, terminalId, sessionId);
  });
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
