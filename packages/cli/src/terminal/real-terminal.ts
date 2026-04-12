import { EventEmitter } from 'events';
import type { TerminalMode, TerminalDimensions } from './types.js';

export const CLI_TERMINAL_ID = 'cli:stdout';

export class RealTerminal extends EventEmitter {
  readonly id = CLI_TERMINAL_ID;
  readonly sessionId?: string;
  private _mode: TerminalMode;
  private _stdout: NodeJS.WriteStream;

  constructor(options: {
    sessionId?: string;
    stdout: NodeJS.WriteStream;
    initialMode?: TerminalMode;
  }) {
    super();
    this.sessionId = options.sessionId;
    this._stdout = options.stdout;
    this._mode = options.initialMode ?? 'active';
  }

  get mode(): TerminalMode {
    return this._mode;
  }

  get cols(): number {
    return this._stdout.columns || 80;
  }

  get rows(): number {
    return this._stdout.rows || 24;
  }

  setMode(mode: TerminalMode): void {
    if (this._mode === mode) return;
    const prevMode = this._mode;
    this._mode = mode;
    this.emit('modeChanged', mode, prevMode);
  }

  getDimensions(): TerminalDimensions {
    return { cols: this.cols, rows: this.rows };
  }
}
