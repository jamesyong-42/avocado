/**
 * Router — I/O multiplexer connecting PTY, local terminal, and sync client
 *
 * Data flow:
 * - Local stdin → PTY
 * - Playground input → PTY
 * - PTY output → Local stdout + Sync client
 * - Local resize → PTY + Sync client
 * - Playground resize → PTY (optional)
 * - Playground kill → PTY kill
 */

import { PTYHost } from './pty-host.js';
import { SyncClient } from './sync-client.js';
import { RealTerminal } from './terminal/index.js';

export interface RouterOptions {
  pty: PTYHost;
  syncClient: SyncClient;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  /** Called when sync client connects */
  onConnect?: () => void;
  /** Called when sync client disconnects */
  onDisconnect?: () => void;
  /** Called when terminal mode changes (active/passive) */
  onModeChange?: (mode: 'active' | 'passive') => void;
  /** Allow playground to send input to PTY (default: true) */
  allowPlaygroundInput?: boolean;
  /** Allow playground to resize PTY (default: false) */
  allowPlaygroundResize?: boolean;
}

export class Router {
  private pty: PTYHost;
  private syncClient: SyncClient;
  private stdin: NodeJS.ReadStream;
  private stdout: NodeJS.WriteStream;
  private onConnect?: () => void;
  private onDisconnect?: () => void;
  private onModeChange?: (mode: 'active' | 'passive') => void;
  private allowPlaygroundInput: boolean;
  private allowPlaygroundResize: boolean;
  private disposed = false;
  private syncListenersSetup = false;
  private focusReportingEnabled = false;
  /** Track last playground resize to prevent local terminal from immediately overriding */
  private lastPlaygroundResizeTime = 0;
  private readonly PLAYGROUND_RESIZE_DEBOUNCE_MS = 500;
  /** RealTerminal abstraction for CLI's stdout */
  private realTerminal: RealTerminal;

  constructor(options: RouterOptions) {
    this.pty = options.pty;
    this.syncClient = options.syncClient;
    this.stdin = options.stdin;
    this.stdout = options.stdout;
    this.onConnect = options.onConnect;
    this.onDisconnect = options.onDisconnect;
    this.onModeChange = options.onModeChange;
    this.allowPlaygroundInput = options.allowPlaygroundInput ?? true;
    this.allowPlaygroundResize = options.allowPlaygroundResize ?? false;

    this.realTerminal = new RealTerminal({
      stdout: this.stdout,
      initialMode: 'active',
    });

    this.realTerminal.on('modeChanged', (mode: 'active' | 'passive') => {
      if (this.onModeChange) {
        this.onModeChange(mode);
      }
    });
  }

  /**
   * Set up sync client listeners
   */
  private setupSyncListeners(): void {
    if (this.syncListenersSetup) return;
    this.syncListenersSetup = true;

    // Playground input → PTY (if allowed)
    if (this.allowPlaygroundInput) {
      this.syncClient.on('input', (data) => {
        if (this.disposed) return;
        this.pty.write(data.toString());
      });
    }

    // Playground resize → PTY (if allowed)
    if (this.allowPlaygroundResize) {
      this.syncClient.on('resize', (cols, rows) => {
        if (this.disposed) return;
        this.lastPlaygroundResizeTime = Date.now();
        this.pty.resize(cols, rows);
      });
    }

    // Playground kill request → PTY kill
    this.syncClient.on('kill', (signal) => {
      if (this.disposed) return;
      this.pty.kill(signal);
    });

    this.syncClient.on('disconnect', () => {
      if (this.onDisconnect) {
        this.onDisconnect();
      }
    });

    this.syncClient.on('connect', () => {
      if (this.onConnect) {
        this.onConnect();
      }
    });

    // Playground focus → CLI becomes passive
    this.syncClient.on('playgroundFocus', (_sessionId, focused) => {
      if (this.disposed) return;
      if (focused) {
        this.realTerminal.setMode('passive');
      }
    });
  }

  /**
   * Start routing I/O
   */
  start(): void {
    // PTY output → Local stdout + Sync client
    this.pty.on('data', (data) => {
      if (this.disposed) return;

      this.stdout.write(data);
      this.syncClient.sendOutput(data);
    });

    // Local stdin → PTY
    if (this.stdin.isTTY) {
      this.stdin.setRawMode(true);
      this.stdout.write('\x1b[?1004h'); // Enable focus reporting
      this.focusReportingEnabled = true;
      this.stdout.write('\x1b[?25h'); // Ensure cursor visible
    }
    this.stdin.resume();
    this.stdin.on('data', (data) => {
      if (this.disposed) return;
      const input = data.toString();

      // Handle focus-in escape
      if (input === '\x1b[I') {
        this.handleFocusIn();
        return;
      }
      // Handle focus-out escape
      if (input === '\x1b[O') {
        this.handleFocusOut();
        return;
      }

      this.pty.write(input);
    });

    this.setupSyncListeners();

    // Handle local terminal resize → PTY + Sync client
    this.stdout.on('resize', () => {
      if (this.disposed) return;

      if (this.realTerminal.mode !== 'active') {
        return;
      }

      const timeSincePlaygroundResize = Date.now() - this.lastPlaygroundResizeTime;
      if (timeSincePlaygroundResize < this.PLAYGROUND_RESIZE_DEBOUNCE_MS) {
        return;
      }

      const { cols, rows } = this.realTerminal.getDimensions();
      this.pty.resize(cols, rows);
      this.syncClient.sendResize(cols, rows);
    });
  }

  /**
   * Clean up and restore terminal
   */
  dispose(): void {
    this.disposed = true;

    if (this.stdin.isTTY) {
      if (this.focusReportingEnabled) {
        this.stdout.write('\x1b[?1004l');
      }
      this.stdin.setRawMode(false);
      this.stdout.write('\x1b[?25h');
    }
    this.stdin.pause();

    this.pty.dispose();
    this.syncClient.dispose();
  }

  private handleFocusIn(): void {
    this.syncClient.sendFocus(true);

    if (this.realTerminal.mode !== 'active') {
      this.realTerminal.setMode('active');
    }

    const { cols, rows } = this.realTerminal.getDimensions();
    this.pty.resize(cols, rows);
    this.syncClient.sendResize(cols, rows);
  }

  private handleFocusOut(): void {
    this.syncClient.sendFocus(false);
  }
}
