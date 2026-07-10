/**
 * Test doubles for IPTYSession / BasePTYSession.
 */

import { EventEmitter } from 'node:events';
import type { IPTYSession, SessionSource } from '#types';
import { BasePTYSession, type BasePTYSessionOptions } from '#types';

/** Concrete BasePTYSession for unit tests. */
export class TestPTYSession extends BasePTYSession {
  written: Array<string | Buffer> = [];
  resized: Array<{ cols: number; rows: number }> = [];
  killed: Array<string | undefined> = [];

  constructor(options: Partial<BasePTYSessionOptions> & Pick<BasePTYSessionOptions, 'id' | 'command'>) {
    super({
      source: 'local',
      cwd: '/tmp',
      isRunning: true,
      ...options,
    });
  }

  write(data: string | Buffer): void {
    this.written.push(data);
  }

  resize(cols: number, rows: number): void {
    this.setSize(cols, rows);
    this.resized.push({ cols, rows });
  }

  kill(signal?: string): void {
    this.killed.push(signal);
    this.setExited(signal === 'SIGKILL' ? 137 : 0, signal);
  }

  /** Inject output as if the PTY produced it. */
  simulateOutput(data: string | Buffer): void {
    this.pushOutput(typeof data === 'string' ? Buffer.from(data) : data);
  }

  simulateFocus(focused: boolean): void {
    this.setFocus(focused);
  }
}

/** Lightweight IPTYSession stub when BasePTYSession is overkill. */
export class FakeSession extends EventEmitter implements IPTYSession {
  id: string;
  source: SessionSource;
  pid: number;
  command: string;
  cwd: string;
  cols: number;
  rows: number;
  isRunning: boolean;
  exitCode: number | null;
  isFocused: boolean;
  startedAt: Date;
  written: Array<string | Buffer> = [];

  constructor(partial: Partial<IPTYSession> & Pick<IPTYSession, 'id'>) {
    super();
    this.id = partial.id;
    this.source = partial.source ?? 'local';
    this.pid = partial.pid ?? 1;
    this.command = partial.command ?? 'bash';
    this.cwd = partial.cwd ?? '/tmp';
    this.cols = partial.cols ?? 80;
    this.rows = partial.rows ?? 24;
    this.isRunning = partial.isRunning ?? true;
    this.exitCode = partial.exitCode ?? null;
    this.isFocused = partial.isFocused ?? false;
    this.startedAt = partial.startedAt ?? new Date();
  }

  write(data: string | Buffer): void {
    this.written.push(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.emit('resized', cols, rows);
  }

  kill(signal?: string): void {
    this.isRunning = false;
    this.exitCode = 0;
    this.emit('exit', 0, signal);
  }

  getOutputBuffer(): Buffer | null {
    return Buffer.alloc(0);
  }

  dispose(): void {
    this.emit('disposed');
    this.removeAllListeners();
  }
}
