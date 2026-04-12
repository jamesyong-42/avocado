/**
 * LocalPTYSession - Direct node-pty control
 *
 * Manages a locally spawned PTY process using node-pty.
 *
 * Note: node-pty must be provided by the consuming package as a peer dependency.
 * This allows the package to remain environment-agnostic.
 */

import { BasePTYSession, DEFAULT_COLS, DEFAULT_ROWS } from '#types';
import { generateLocalSessionId } from '#types';

// ===============================================================================
// NODE-PTY INTERFACE
// ===============================================================================

/**
 * Minimal interface for node-pty IPty
 * Allows dependency injection without requiring node-pty in this package directly
 */
export interface IPty {
  readonly pid: number;
  readonly cols: number;
  readonly rows: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData: (callback: (data: string) => void) => { dispose: () => void };
  onExit: (callback: (exit: { exitCode: number; signal?: number }) => void) => { dispose: () => void };
}

/**
 * Options for spawning a PTY process
 */
export interface PTYSpawnConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  name?: string;
}

/**
 * Function type for spawning PTY processes
 */
export type PTYSpawnFunction = (config: PTYSpawnConfig) => IPty;

// ===============================================================================
// LOCAL PTY SESSION
// ===============================================================================

/**
 * Local PTY session with direct node-pty control
 */
export class LocalPTYSession extends BasePTYSession {
  private pty: IPty;
  private dataDisposable: { dispose: () => void } | null = null;
  private exitDisposable: { dispose: () => void } | null = null;
  private viewers: Set<string> = new Set();

  /**
   * Create a LocalPTYSession from an existing IPty instance
   */
  constructor(pty: IPty, options: LocalPTYSessionOptions) {
    super({
      id: options.id ?? generateLocalSessionId(),
      source: 'local',
      pid: pty.pid,
      command: options.command,
      cwd: options.cwd ?? process.cwd(),
      cols: pty.cols,
      rows: pty.rows,
      isRunning: true,
      isFocused: options.isFocused ?? false,
      outputBufferSize: options.outputBufferSize,
    });

    this.pty = pty;
    this.setupListeners();
  }

  /**
   * Create and spawn a new local PTY session
   * @param spawn Function to spawn PTY (from node-pty)
   * @param config Spawn configuration
   * @param options Additional session options
   */
  static spawn(
    spawn: PTYSpawnFunction,
    config: PTYSpawnConfig,
    options?: Partial<LocalPTYSessionOptions>
  ): LocalPTYSession {
    const pty = spawn({
      command: config.command,
      args: config.args ?? [],
      cwd: config.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...config.env,
        TERM: 'xterm-256color',
        FORCE_COLOR: '1',
      } as Record<string, string>,
      cols: config.cols ?? DEFAULT_COLS,
      rows: config.rows ?? DEFAULT_ROWS,
      name: config.name ?? 'xterm-color',
    });

    return new LocalPTYSession(pty, {
      command: config.command,
      cwd: config.cwd ?? process.cwd(),
      ...options,
    });
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private setupListeners(): void {
    this.dataDisposable = this.pty.onData((data: string) => {
      this.pushOutput(Buffer.from(data));
    });

    this.exitDisposable = this.pty.onExit(({ exitCode, signal }) => {
      this.setExited(exitCode, signal !== undefined ? String(signal) : undefined);
    });
  }

  // ---------------------------------------------------------------------------
  // IPTYSession Implementation
  // ---------------------------------------------------------------------------

  write(data: string | Buffer): void {
    if (this._disposed || !this._isRunning) return;
    const str = typeof data === 'string' ? data : data.toString();
    this.pty.write(str);
  }

  resize(cols: number, rows: number): void {
    if (this._disposed || !this._isRunning) return;
    if (this._cols === cols && this._rows === rows) return;
    this.pty.resize(cols, rows);
    this.setSize(cols, rows);
  }

  kill(signal?: string): void {
    if (this._disposed || !this._isRunning) return;
    this.pty.kill(signal);
  }

  // ---------------------------------------------------------------------------
  // Focus & Viewer Management
  // ---------------------------------------------------------------------------

  setFocused(focused: boolean): void {
    this.setFocus(focused);
  }

  hasViewers(): boolean {
    return this.viewers.size > 0;
  }

  getViewerCount(): number {
    return this.viewers.size;
  }

  notifyViewerAttached(viewerId: string): void {
    if (this._disposed) return;
    if (!this.viewers.has(viewerId)) {
      this.viewers.add(viewerId);
      this.emit('viewerAttached', viewerId);
    }
  }

  notifyViewerDetached(viewerId: string): void {
    if (this._disposed) return;
    if (this.viewers.has(viewerId)) {
      this.viewers.delete(viewerId);
      this.emit('viewerDetached', viewerId);
    }
  }

  // ---------------------------------------------------------------------------
  // Disposal
  // ---------------------------------------------------------------------------

  override dispose(): void {
    if (this._disposed) return;

    if (this.dataDisposable) {
      this.dataDisposable.dispose();
      this.dataDisposable = null;
    }
    if (this.exitDisposable) {
      this.exitDisposable.dispose();
      this.exitDisposable = null;
    }

    if (this._isRunning) {
      try {
        this.pty.kill();
      } catch {
        // Ignore errors during disposal
      }
    }

    this.viewers.clear();
    super.dispose();
  }
}

// ===============================================================================
// OPTIONS INTERFACE
// ===============================================================================

export interface LocalPTYSessionOptions {
  /** Session ID (auto-generated if not provided) */
  id?: string;
  /** Command being executed */
  command: string;
  /** Working directory */
  cwd?: string;
  /** Initial focus state */
  isFocused?: boolean;
  /** Output buffer size (default: 1MB) */
  outputBufferSize?: number;
}
