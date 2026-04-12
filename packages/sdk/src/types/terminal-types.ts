/**
 * Shared types for terminal management (renderer-side types)
 */

import type { SessionSource } from './types.js';

export type TerminalType = 'headless' | 'virtual';
export type TerminalMode = 'active' | 'passive';

export interface PtySession {
  id: string;
  source: SessionSource;
  command: string;
  cwd: string;
  /** Epoch milliseconds */
  createdAt: number;
  pid: number;
  cols: number;
  rows: number;
  isRunning: boolean;
  isFocused?: boolean;
  exitCode?: number | null;
  /** Device ID for remote (ws) sessions */
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
  /** Epoch milliseconds */
  createdAt: number;
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
