/**
 * Shared IPC contract between main, preload, and renderer.
 *
 * Deliberately minimal: the preload bridge exposes exactly the shape of the
 * SDK's `TerminalBackend` (pty + terminal slices), so the renderer adapter
 * is a pass-through. No lifecycle/mesh/peers — this app is local-only.
 */

export const IPC = {
  PTY_CREATE: 'pty:create',
  PTY_DESTROY: 'pty:destroy',
  PTY_LIST: 'pty:list',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',

  TERMINAL_CREATE_VIRTUAL: 'terminal:create-virtual',
  TERMINAL_DESTROY: 'terminal:destroy',
  TERMINAL_LIST: 'terminal:list',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_SET_ACTIVE: 'terminal:set-active',

  EVT_PTY_OUTPUT: 'evt:pty-output',
  EVT_PTY_EXIT: 'evt:pty-exit',
} as const;

export type Unsubscribe = () => void;

export interface IPCPtySession {
  id: string;
  source: string;
  command: string;
  cwd: string;
  createdAt: number;
  pid: number;
  cols: number;
  rows: number;
  isRunning: boolean;
  exitCode?: number | null;
}

export interface IPCTerminalInfo {
  id: string;
  sessionId: string;
  type: string;
  mode: string;
  cols: number;
  rows: number;
  createdAt: number;
}

/** Static facts the renderer needs synchronously (no IPC round-trip). */
export interface GhosttyAppInfo {
  platform: NodeJS.Platform;
  /** Basename of the login shell, e.g. "zsh" — used for tab titles. */
  shellName: string;
}
