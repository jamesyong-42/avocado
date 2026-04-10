/**
 * Shared types for terminal management (renderer-side types)
 */

export type TerminalSessionSource = 'local' | 'ipc' | 'remote';
export type TerminalType = 'headless' | 'virtual';
export type TerminalMode = 'active' | 'passive';

export interface PtySession {
  id: string;
  source: TerminalSessionSource;
  command: string;
  cwd: string;
  createdAt: string;
  pid: number;
  cols: number;
  rows: number;
  isRunning: boolean;
  isFocused?: boolean;
  exitCode?: number | null;
  /** Device ID for remote (WS) sessions */
  deviceId?: string;
}

export interface IPCConnectionInfo {
  id: string;
  connectedAt: string;
  metadata: Record<string, unknown>;
}

export interface TerminalInfo {
  id: string;
  sessionId: string;
  type: TerminalType;
  mode: TerminalMode;
  cols: number;
  rows: number;
  createdAt: string;
}

export interface TerminalSettings {
  autoResize: boolean;
  width?: number;
  height?: number;
}

export interface CreateSessionOptions {
  cwd: string;
  cols: number;
  rows: number;
}

export interface CreateTerminalOptions {
  cols: number;
  rows: number;
  mode: TerminalMode;
}
