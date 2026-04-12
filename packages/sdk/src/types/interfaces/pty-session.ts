/**
 * IPTYSession - Unified interface for all PTY sessions
 *
 * This interface abstracts over:
 * - LocalPTYSession: Direct node-pty control
 * - ProxyPTYSession: Remote session via transport
 *
 * Both session types expose the same interface, allowing PTYSessionManager
 * to manage them uniformly.
 */

import { EventEmitter } from 'events';
import type { SessionSource } from '../types.js';

// ===============================================================================
// IPTYSESSION INTERFACE
// ===============================================================================

/**
 * Unified interface for all PTY sessions
 *
 * Implements the Remote Proxy pattern - ProxyPTYSession delegates operations
 * to a remote session via IPTYTransport, while LocalPTYSession controls
 * node-pty directly.
 */
export interface IPTYSession extends EventEmitter {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** Unique session identifier */
  readonly id: string;

  /** Source type: 'local', 'ipc', or 'ws' */
  readonly source: SessionSource;

  /** Process ID of the terminal process */
  readonly pid: number;

  /** Command being executed */
  readonly command: string;

  /** Current working directory */
  readonly cwd: string;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Terminal columns */
  readonly cols: number;

  /** Terminal rows */
  readonly rows: number;

  /** Whether the session is still running */
  readonly isRunning: boolean;

  /** Exit code if terminated, null if still running */
  readonly exitCode: number | null;

  /** Whether this session currently has focus */
  readonly isFocused: boolean;

  /** When the session started */
  readonly startedAt: Date;

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  /**
   * Write data to the terminal
   * For local sessions: writes directly to node-pty
   * For proxy sessions: sends via transport to remote
   */
  write(data: string | Buffer): void;

  /**
   * Resize the terminal
   * For local sessions: resizes node-pty directly
   * For proxy sessions: sends resize request via transport
   */
  resize(cols: number, rows: number): void;

  /**
   * Kill the terminal process
   * @param signal Optional signal (e.g., 'SIGTERM', 'SIGKILL')
   */
  kill(signal?: string): void;

  /**
   * Get buffered output for replay
   * @param maxBytes Optional maximum bytes to return
   * @returns Buffer containing recent output, or null if unavailable
   */
  getOutputBuffer(maxBytes?: number): Buffer | null;

  /**
   * Dispose of the session and clean up resources
   */
  dispose(): void;

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  /** Emitted when terminal output is received */
  on(event: 'output', listener: (data: Buffer) => void): this;
  once(event: 'output', listener: (data: Buffer) => void): this;
  off(event: 'output', listener: (data: Buffer) => void): this;

  /** Emitted when the terminal process exits */
  on(event: 'exit', listener: (code: number, signal?: string) => void): this;
  once(event: 'exit', listener: (code: number, signal?: string) => void): this;
  off(event: 'exit', listener: (code: number, signal?: string) => void): this;

  /** Emitted when the terminal is resized */
  on(event: 'resized', listener: (cols: number, rows: number) => void): this;
  once(event: 'resized', listener: (cols: number, rows: number) => void): this;
  off(event: 'resized', listener: (cols: number, rows: number) => void): this;

  /** Emitted when focus state changes */
  on(event: 'focusChanged', listener: (focused: boolean) => void): this;
  once(event: 'focusChanged', listener: (focused: boolean) => void): this;
  off(event: 'focusChanged', listener: (focused: boolean) => void): this;

  /** Emitted when the session is disposed */
  on(event: 'disposed', listener: () => void): this;
  once(event: 'disposed', listener: () => void): this;
  off(event: 'disposed', listener: () => void): this;

  // Generic event overloads
  emit(event: 'output', data: Buffer): boolean;
  emit(event: 'exit', code: number, signal?: string): boolean;
  emit(event: 'resized', cols: number, rows: number): boolean;
  emit(event: 'focusChanged', focused: boolean): boolean;
  emit(event: 'disposed'): boolean;
}

// ===============================================================================
// SESSION EVENTS TYPE
// ===============================================================================

/**
 * Type-safe event map for IPTYSession
 */
export interface PTYSessionEvents {
  output: [data: Buffer];
  exit: [code: number, signal?: string];
  resized: [cols: number, rows: number];
  focusChanged: [focused: boolean];
  disposed: [];
}
