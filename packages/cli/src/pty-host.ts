/**
 * PTY Host — Spawns a command in a pseudo-terminal
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';

export interface PTYHostOptions {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
}

export interface PTYHost {
  on(event: 'data', listener: (data: string) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  emit(event: 'data', data: string): boolean;
  emit(event: 'exit', code: number): boolean;
}

export class PTYHost extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private options: PTYHostOptions;

  constructor(options: PTYHostOptions) {
    super();
    this.options = options;
  }

  /**
   * Spawn the PTY process
   */
  spawn(): void {
    if (this.ptyProcess) {
      throw new Error('PTY already spawned');
    }

    this.ptyProcess = pty.spawn(this.options.command, this.options.args, {
      name: 'xterm-256color',
      cols: this.options.cols,
      rows: this.options.rows,
      cwd: this.options.cwd,
      env: this.options.env,
    });

    this.ptyProcess.onData((data) => {
      this.emit('data', data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this.emit('exit', exitCode);
    });
  }

  /**
   * Write data to the PTY (stdin)
   */
  write(data: string): void {
    if (!this.ptyProcess) {
      throw new Error('PTY not spawned');
    }
    this.ptyProcess.write(data);
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    if (!this.ptyProcess) {
      return;
    }
    this.ptyProcess.resize(cols, rows);
  }

  /**
   * Get the PTY's PID
   */
  get pid(): number {
    return this.ptyProcess?.pid ?? -1;
  }

  /**
   * Kill the PTY process
   */
  kill(signal?: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill(signal);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    this.removeAllListeners();
  }
}
