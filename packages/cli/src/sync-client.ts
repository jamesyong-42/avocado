/**
 * SyncClient — High-level API for CLI ↔ Playground communication
 *
 * Wraps Transport with handshake, heartbeat, session management,
 * and output buffering.
 *
 * Handshake Flow:
 * 1. CLI connects to UDS socket
 * 2. CLI sends 'hello' with version and PID
 * 3. Playground responds with 'welcome' and its version
 * 4. CLI sends 'session:announce' for the wrapped session
 * 5. Normal message flow continues
 */

import { EventEmitter } from 'events';
import {
  Transport,
  createTransport,
  type TransportOptions,
} from './transport.js';
import {
  generateSessionId,
  createHello,
  createSessionAnnounce,
  createOutput,
  createSessionEnd,
  createResize,
  createHeartbeat,
  createFocus,
  isWelcome,
  isFocus,
  isInput,
  isResize,
  isKill,
  isHeartbeatAck,
  type WelcomePayload,
  type FocusPayload,
  type InputPayload,
  type ResizePayload,
  type KillPayload,
} from './protocol.js';
import type { NamespacedMessage } from './wire.js';
import {
  CLI_VERSION,
  HEARTBEAT_INTERVAL_MS,
  HANDSHAKE_TIMEOUT_MS,
} from './config.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type HandshakeState = 'pending' | 'completed' | 'failed';

export interface SyncClientOptions {
  /** Current working directory */
  cwd: string;
  /** Command being wrapped */
  command: string;
  /** Process ID */
  pid: number;
  /** Terminal columns */
  cols: number;
  /** Terminal rows */
  rows: number;
  /** Project path (for context) */
  projectPath?: string;
  /** Socket path override */
  socketPath?: string;
  /** Auto-retry connection (default: true) */
  autoRetry?: boolean;
  /** Handshake timeout in ms (default: 5000) */
  handshakeTimeout?: number;
}

export interface SyncClientEvents {
  /** Terminal input received from playground */
  input: [data: Buffer];
  /** Resize request from playground */
  resize: [cols: number, rows: number];
  /** Kill signal from playground */
  kill: [signal: string | undefined];
  /** Connected and handshake completed */
  connect: [];
  /** Disconnected from playground */
  disconnect: [reason: string];
  /** Focus state from playground (playground terminal has focus) */
  playgroundFocus: [sessionId: string, focused: boolean];
  /** Error occurred */
  error: [err: Error];
  /** Handshake completed with playground version */
  handshakeComplete: [playgroundVersion: string];
}

export interface SyncClient extends EventEmitter {
  on<K extends keyof SyncClientEvents>(
    event: K,
    listener: (...args: SyncClientEvents[K]) => void
  ): this;
  off<K extends keyof SyncClientEvents>(
    event: K,
    listener: (...args: SyncClientEvents[K]) => void
  ): this;
  emit<K extends keyof SyncClientEvents>(
    event: K,
    ...args: SyncClientEvents[K]
  ): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class SyncClient extends EventEmitter {
  private transport: Transport;
  private options: SyncClientOptions;
  private sessionId: string;
  private disposed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private handshakeState: HandshakeState = 'pending';
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private playgroundVersion: string | null = null;

  constructor(options: SyncClientOptions) {
    super();
    this.options = options;
    this.sessionId = generateSessionId(options.pid);

    const transportOptions: TransportOptions = {
      socketPath: options.socketPath,
      autoRetry: options.autoRetry ?? true,
    };
    this.transport = createTransport(transportOptions);

    this.setupTransportHandlers();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────────────────────

  getSessionId(): string {
    return this.sessionId;
  }

  isConnected(): boolean {
    return this.transport.isConnected() && this.handshakeState === 'completed';
  }

  isTransportConnected(): boolean {
    return this.transport.isConnected();
  }

  getHandshakeState(): HandshakeState {
    return this.handshakeState;
  }

  getPlaygroundVersion(): string | null {
    return this.playgroundVersion;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONNECTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Try to connect and complete handshake.
   * Returns true if connected and handshake completed.
   */
  async connect(): Promise<boolean> {
    if (this.disposed) return false;

    const connected = await this.transport.connect();
    if (!connected) return false;

    return this.waitForHandshake();
  }

  startRetrying(): void {
    this.transport.startRetrying();
  }

  stopRetrying(): void {
    this.transport.stopRetrying();
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.cancelHandshakeTimer();
    this.transport.disconnect('manual');
  }

  dispose(): void {
    this.disposed = true;
    this.stopHeartbeat();
    this.cancelHandshakeTimer();
    this.transport.dispose();
    this.removeAllListeners();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SENDING MESSAGES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Send terminal output. Buffers if not connected.
   */
  sendOutput(data: string | Buffer): void {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    if (!this.isConnected()) {
      this.transport.bufferOutput(dataBuffer);
      return;
    }

    const msg = createOutput(this.sessionId, dataBuffer);
    this.transport.send(msg);
  }

  sendSessionEnd(exitCode: number): void {
    const msg = createSessionEnd(this.sessionId, exitCode);
    this.transport.send(msg);
  }

  sendResize(cols: number, rows: number): void {
    this.options.cols = cols;
    this.options.rows = rows;

    const msg = createResize(this.sessionId, cols, rows);
    this.transport.send(msg);
  }

  sendFocus(focused: boolean): void {
    const msg = createFocus(this.sessionId, focused);
    this.transport.send(msg);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSPORT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  private setupTransportHandlers(): void {
    this.transport.on('connect', () => {
      this.handshakeState = 'pending';
      this.playgroundVersion = null;
      this.sendHello();
      this.startHandshakeTimer();
    });

    this.transport.on('disconnect', (reason) => {
      this.stopHeartbeat();
      this.cancelHandshakeTimer();
      this.handshakeState = 'pending';
      this.playgroundVersion = null;
      this.emit('disconnect', reason);
    });

    this.transport.on('error', (err) => {
      this.emit('error', err);
    });

    this.transport.on('message', (msg) => {
      this.handleMessage(msg);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HANDSHAKE
  // ─────────────────────────────────────────────────────────────────────────

  private sendHello(): void {
    const msg = createHello(CLI_VERSION, this.options.pid);
    this.transport.send(msg);
  }

  private startHandshakeTimer(): void {
    this.cancelHandshakeTimer();
    const timeout = this.options.handshakeTimeout ?? HANDSHAKE_TIMEOUT_MS;

    this.handshakeTimer = setTimeout(() => {
      if (this.handshakeState === 'pending') {
        this.handshakeState = 'failed';
        this.transport.resetConnection('handshake timeout');
      }
    }, timeout);
  }

  private cancelHandshakeTimer(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  private async waitForHandshake(): Promise<boolean> {
    if (this.handshakeState === 'completed') return true;
    if (this.handshakeState === 'failed') return false;

    return new Promise((resolve) => {
      const cleanup = () => {
        this.off('handshakeComplete', onComplete);
        this.off('disconnect', onDisconnect);
        this.off('error', onError);
      };

      const onComplete = () => {
        cleanup();
        resolve(true);
      };
      const onDisconnect = () => {
        cleanup();
        resolve(false);
      };
      const onError = () => {
        cleanup();
        resolve(false);
      };

      this.once('handshakeComplete', onComplete);
      this.once('disconnect', onDisconnect);
      this.once('error', onError);
    });
  }

  private handleWelcome(payload: WelcomePayload): void {
    this.cancelHandshakeTimer();
    this.handshakeState = 'completed';
    this.playgroundVersion = payload.desktopVersion;

    this.sendSessionAnnounce();
    this.startHeartbeat();

    this.emit('handshakeComplete', payload.desktopVersion);
    this.emit('connect');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MESSAGE HANDLING
  // ─────────────────────────────────────────────────────────────────────────

  private sendSessionAnnounce(): void {
    const msg = createSessionAnnounce(
      this.sessionId,
      this.options.pid,
      this.options.command,
      this.options.cwd,
      this.options.cols,
      this.options.rows,
      CLI_VERSION
    );

    if (this.options.projectPath && msg.payload) {
      msg.payload.projectPath = this.options.projectPath;
    }

    this.transport.send(msg);

    // Flush buffered output
    if (this.transport.hasBufferedOutput()) {
      const bufferedData = this.transport.getAndClearOutputBuffer();
      const outputMsg = createOutput(this.sessionId, bufferedData);
      this.transport.send(outputMsg);
    }
  }

  private handleMessage(msg: NamespacedMessage): void {
    if (isWelcome(msg) && msg.payload) {
      this.handleWelcome(msg.payload);
      return;
    }

    if (isFocus(msg) && msg.payload) {
      const payload = msg.payload as FocusPayload;
      if (payload.sessionId === this.sessionId) {
        this.emit('playgroundFocus', payload.sessionId, payload.focused);
      }
      return;
    }

    if (isInput(msg) && msg.payload) {
      const payload = msg.payload as InputPayload;
      if (payload.sessionId !== this.sessionId) return;
      const data = Buffer.from(payload.data, 'base64');
      this.emit('input', data);
      return;
    }

    if (isResize(msg) && msg.payload) {
      const payload = msg.payload as ResizePayload;
      if (payload.sessionId !== this.sessionId) return;
      this.emit('resize', payload.cols, payload.rows);
      return;
    }

    if (isKill(msg) && msg.payload) {
      const payload = msg.payload as KillPayload;
      if (payload.sessionId !== this.sessionId) return;
      this.emit('kill', payload.signal);
      return;
    }

    if (isHeartbeatAck(msg)) {
      return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HEARTBEAT
  // ─────────────────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        const msg = createHeartbeat(this.sessionId);
        this.transport.send(msg);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export function createSyncClient(options: SyncClientOptions): SyncClient {
  return new SyncClient(options);
}
