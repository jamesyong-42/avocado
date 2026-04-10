/**
 * BasePTYSession - Abstract base class for PTY sessions
 *
 * Provides shared functionality for LocalPTYSession and ProxyPTYSession:
 * - Output buffering
 * - State management
 * - Event emission
 * - Common properties
 */

import { EventEmitter } from 'events';
import type { IPTYSession } from '../interfaces/pty-session.js';
import type { SessionSource, SessionMetadata, PTYSessionState } from '../types.js';
import { CircularOutputBuffer } from '../utils/output-buffer.js';

// ===============================================================================
// CONSTANTS
// ===============================================================================

/** Default terminal columns */
export const DEFAULT_COLS = 80;

/** Default terminal rows */
export const DEFAULT_ROWS = 24;

/** Maximum output buffer size per session (1 MB) */
export const MAX_OUTPUT_BUFFER_SIZE = 1024 * 1024;

// ===============================================================================
// BASE PTY SESSION
// ===============================================================================

/**
 * Abstract base class for PTY sessions
 *
 * Handles:
 * - Output buffering
 * - State management
 * - Event emission
 */
export abstract class BasePTYSession extends EventEmitter implements IPTYSession {
  // ---------------------------------------------------------------------------
  // Protected State
  // ---------------------------------------------------------------------------

  protected _id: string;
  protected _source: SessionSource;
  protected _pid: number;
  protected _command: string;
  protected _cwd: string;
  protected _cols: number;
  protected _rows: number;
  protected _isRunning: boolean;
  protected _exitCode: number | null;
  protected _isFocused: boolean;
  protected _startedAt: Date;
  protected _metadata?: SessionMetadata;
  protected _outputBuffer: CircularOutputBuffer;
  protected _disposed: boolean = false;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(options: BasePTYSessionOptions) {
    super();
    this._id = options.id;
    this._source = options.source;
    this._pid = options.pid ?? 0;
    this._command = options.command;
    this._cwd = options.cwd;
    this._cols = options.cols ?? DEFAULT_COLS;
    this._rows = options.rows ?? DEFAULT_ROWS;
    this._isRunning = options.isRunning ?? true;
    this._exitCode = options.exitCode ?? null;
    this._isFocused = options.isFocused ?? false;
    this._startedAt = options.startedAt ?? new Date();
    this._metadata = options.metadata;
    this._outputBuffer = new CircularOutputBuffer(options.outputBufferSize);
  }

  // ---------------------------------------------------------------------------
  // Identity (Readonly)
  // ---------------------------------------------------------------------------

  get id(): string {
    return this._id;
  }

  get source(): SessionSource {
    return this._source;
  }

  get pid(): number {
    return this._pid;
  }

  get command(): string {
    return this._command;
  }

  get cwd(): string {
    return this._cwd;
  }

  // ---------------------------------------------------------------------------
  // State (Readonly)
  // ---------------------------------------------------------------------------

  get cols(): number {
    return this._cols;
  }

  get rows(): number {
    return this._rows;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get exitCode(): number | null {
    return this._exitCode;
  }

  get isFocused(): boolean {
    return this._isFocused;
  }

  get startedAt(): Date {
    return this._startedAt;
  }

  get metadata(): SessionMetadata | undefined {
    return this._metadata;
  }

  // ---------------------------------------------------------------------------
  // Output Buffer
  // ---------------------------------------------------------------------------

  getOutputBuffer(maxBytes?: number): Buffer | null {
    if (this._disposed) {
      return null;
    }
    return this._outputBuffer.get(maxBytes);
  }

  /**
   * Add data to the output buffer and emit output event
   * (Called by subclasses when output is received)
   */
  protected pushOutput(data: Buffer): void {
    if (this._disposed) {
      return;
    }
    this._outputBuffer.push(data);
    this.emit('output', data);
  }

  // ---------------------------------------------------------------------------
  // State Updates (Protected)
  // ---------------------------------------------------------------------------

  /**
   * Update running state and exit code
   * Emits 'exit' event when session ends
   */
  protected setExited(exitCode: number, signal?: string): void {
    if (!this._isRunning) {
      return;
    }
    this._isRunning = false;
    this._exitCode = exitCode;
    this.emit('exit', exitCode, signal);
  }

  /**
   * Update terminal dimensions
   * Emits 'resized' event if dimensions changed
   */
  protected setSize(cols: number, rows: number): void {
    if (this._cols === cols && this._rows === rows) {
      return;
    }
    this._cols = cols;
    this._rows = rows;
    this.emit('resized', cols, rows);
  }

  /**
   * Update focus state
   * Emits 'focusChanged' event if state changed
   */
  protected setFocus(focused: boolean): void {
    if (this._isFocused === focused) {
      return;
    }
    this._isFocused = focused;
    this.emit('focusChanged', focused);
  }

  // ---------------------------------------------------------------------------
  // Abstract Methods
  // ---------------------------------------------------------------------------

  /** Write data to the terminal */
  abstract write(data: string | Buffer): void;

  /** Resize the terminal */
  abstract resize(cols: number, rows: number): void;

  /** Kill the terminal process */
  abstract kill(signal?: string): void;

  // ---------------------------------------------------------------------------
  // Disposal
  // ---------------------------------------------------------------------------

  /** Dispose of the session */
  dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._outputBuffer.clear();
    this.emit('disposed');
    this.removeAllListeners();
  }

  /** Check if disposed */
  get isDisposed(): boolean {
    return this._disposed;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /** Convert to PTYSessionState */
  toInfo(): PTYSessionState {
    return {
      id: this._id,
      source: this._source,
      pid: this._pid,
      command: this._command,
      cwd: this._cwd,
      cols: this._cols,
      rows: this._rows,
      startedAt: this._startedAt,
      exitCode: this._exitCode,
      isRunning: this._isRunning,
      isFocused: this._isFocused,
      metadata: this._metadata,
    };
  }
}

// ===============================================================================
// OPTIONS INTERFACE
// ===============================================================================

/**
 * Options for creating a BasePTYSession
 */
export interface BasePTYSessionOptions {
  /** Session ID */
  id: string;
  /** Session source */
  source: SessionSource;
  /** Process ID */
  pid?: number;
  /** Command being executed */
  command: string;
  /** Working directory */
  cwd: string;
  /** Terminal columns */
  cols?: number;
  /** Terminal rows */
  rows?: number;
  /** Whether running */
  isRunning?: boolean;
  /** Exit code if exited */
  exitCode?: number | null;
  /** Whether focused */
  isFocused?: boolean;
  /** When started */
  startedAt?: Date;
  /** Session metadata */
  metadata?: SessionMetadata;
  /** Output buffer size (default: 1MB) */
  outputBufferSize?: number;
}
