/**
 * Preload bridge — exposes `window.avocado` to the renderer.
 *
 * Runs in Electron's preload sandbox with `contextIsolation: true`. Only
 * `electron` and the shared IPC contract are imported — no Node-only or
 * avocado main-process code.
 *
 * Every invoke channel is wired to `ipcRenderer.invoke`; every push channel
 * becomes an `onX(cb)` subscriber that returns an `Unsubscribe` function
 * so React effects can clean up properly.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import {
  IPC,
  type AvocadoAPI,
  type IPCPtySession,
  type IPCTerminalInfo,
  type NodeStatusEvent,
  type PeerInfo,
  type Unsubscribe,
} from '@shared/ipc';

/**
 * Subscribe to a push channel and return an `Unsubscribe` function.
 *
 * The factory takes a translator from `(...args)` (raw `send` arguments)
 * to whatever the callback expects. Most events are single-payload, in
 * which case the translator is identity; multi-arg events (e.g. pty output)
 * pack the args into the callback arg list directly.
 */
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

const api: AvocadoAPI = {
  // ─── Lifecycle ──────────────────────────────────────────────────────────
  lifecycle: {
    start: (): Promise<NodeStatusEvent> =>
      ipcRenderer.invoke(IPC.LIFECYCLE_START),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.LIFECYCLE_STOP),
    getStatus: (): Promise<NodeStatusEvent> =>
      ipcRenderer.invoke(IPC.LIFECYCLE_GET_STATUS),
    onStatusChanged: (cb): Unsubscribe =>
      subscribe<[NodeStatusEvent]>(IPC.EVT_STATUS_CHANGED, cb),
    onAuthRequired: (cb): Unsubscribe =>
      subscribe<[string]>(IPC.EVT_AUTH_REQUIRED, cb),
  },

  // ─── Peers ──────────────────────────────────────────────────────────────
  peers: {
    list: (): Promise<PeerInfo[]> => ipcRenderer.invoke(IPC.PEERS_LIST),
    onChanged: (cb): Unsubscribe =>
      subscribe<[PeerInfo[]]>(IPC.EVT_PEERS_CHANGED, cb),
  },

  // ─── PTY ────────────────────────────────────────────────────────────────
  pty: {
    create: (options): Promise<{
      success: boolean;
      sessionId?: string;
      error?: string;
    }> => ipcRenderer.invoke(IPC.PTY_CREATE, options),
    destroy: (sessionId): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PTY_DESTROY, sessionId),
    list: (): Promise<{
      success: boolean;
      sessions?: IPCPtySession[];
      error?: string;
    }> => ipcRenderer.invoke(IPC.PTY_LIST),
    write: (sessionId, data): Promise<void> =>
      ipcRenderer.invoke(IPC.PTY_WRITE, sessionId, data),
    resize: (
      sessionId,
      cols,
      rows
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PTY_RESIZE, sessionId, cols, rows),
    onOutput: (cb): Unsubscribe =>
      subscribe<[string, string, string]>(IPC.EVT_PTY_OUTPUT, cb),
    onExit: (cb): Unsubscribe =>
      subscribe<[string, number]>(IPC.EVT_PTY_EXIT, cb),
    onSessionDiscovered: (cb): Unsubscribe =>
      subscribe<[{ sessionId: string; source: string }]>(
        IPC.EVT_PTY_SESSION_DISCOVERED,
        cb
      ),
    onSessionLost: (cb): Unsubscribe =>
      subscribe<[{ sessionId: string; source: string; reason: string }]>(
        IPC.EVT_PTY_SESSION_LOST,
        cb
      ),
    onSessionResized: (cb): Unsubscribe =>
      subscribe<[string, number, number, string, string]>(
        IPC.EVT_PTY_SESSION_RESIZED,
        cb
      ),
  },

  // ─── Terminal ───────────────────────────────────────────────────────────
  terminal: {
    createVirtual: (
      sessionId,
      options
    ): Promise<{
      success: boolean;
      terminalId?: string;
      error?: string;
    }> => ipcRenderer.invoke(IPC.TERMINAL_CREATE_VIRTUAL, sessionId, options),
    createHeadless: (
      sessionId,
      options
    ): Promise<{
      success: boolean;
      terminalId?: string;
      error?: string;
    }> => ipcRenderer.invoke(IPC.TERMINAL_CREATE_HEADLESS, sessionId, options),
    destroy: (terminalId): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.TERMINAL_DESTROY, terminalId),
    list: (): Promise<{
      success: boolean;
      terminals?: IPCTerminalInfo[];
      error?: string;
    }> => ipcRenderer.invoke(IPC.TERMINAL_LIST),
    resize: (
      terminalId,
      cols,
      rows
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.TERMINAL_RESIZE, terminalId, cols, rows),
    setActive: (terminalId): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.TERMINAL_SET_ACTIVE, terminalId),
    onDestroyed: (cb): Unsubscribe =>
      subscribe<[string, string]>(IPC.EVT_TERMINAL_DESTROYED, cb),
  },
};

contextBridge.exposeInMainWorld('avocado', api);
