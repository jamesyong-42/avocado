/**
 * Transport — UDS client with retry and output buffering
 *
 * Provides:
 * - Unix Domain Socket connection to the playground app
 * - Length-prefixed MessagePack framing via wire.ts
 * - Automatic reconnection with configurable retry
 * - Output buffering for late connections
 */

import { Socket, createConnection } from 'net';
import { EventEmitter } from 'events';
import {
  encodeMessage,
  parseFrames,
  type NamespacedMessage,
} from './wire.js';
import {
  getSocketPath,
  CONNECTION_TIMEOUT_MS,
  RETRY_INTERVAL_MS,
  MAX_OUTPUT_BUFFER_SIZE,
} from './config.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface TransportOptions {
  /** Socket path override (defaults to ~/.avocado/playground.sock) */
  socketPath?: string;
  /** Connection timeout in ms (default: 5000) */
  connectionTimeout?: number;
  /** Retry interval in ms (default: 5000) */
  retryInterval?: number;
  /** Max output buffer size in bytes (default: 1MB) */
  maxOutputBuffer?: number;
  /** Auto-retry on disconnect (default: true) */
  autoRetry?: boolean;
}

export interface TransportEvents {
  connect: [];
  disconnect: [reason: string];
  message: [msg: NamespacedMessage];
  error: [err: Error];
  stateChange: [state: ConnectionState];
}

export interface Transport extends EventEmitter {
  on<K extends keyof TransportEvents>(
    event: K,
    listener: (...args: TransportEvents[K]) => void
  ): this;
  off<K extends keyof TransportEvents>(
    event: K,
    listener: (...args: TransportEvents[K]) => void
  ): this;
  emit<K extends keyof TransportEvents>(
    event: K,
    ...args: TransportEvents[K]
  ): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class Transport extends EventEmitter {
  private socket: Socket | null = null;
  private state: ConnectionState = 'disconnected';
  private buffer: Buffer = Buffer.alloc(0);
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private outputBuffer: Buffer = Buffer.alloc(0);

  private readonly socketPath: string;
  private readonly connectionTimeout: number;
  private readonly retryInterval: number;
  private readonly maxOutputBuffer: number;
  private readonly autoRetry: boolean;

  constructor(options: TransportOptions = {}) {
    super();
    this.socketPath = options.socketPath ?? getSocketPath();
    this.connectionTimeout = options.connectionTimeout ?? CONNECTION_TIMEOUT_MS;
    this.retryInterval = options.retryInterval ?? RETRY_INTERVAL_MS;
    this.maxOutputBuffer = options.maxOutputBuffer ?? MAX_OUTPUT_BUFFER_SIZE;
    this.autoRetry = options.autoRetry ?? true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONNECTION MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Try to connect to the playground app.
   * Returns true if connected, false if not running.
   */
  async connect(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.state === 'connected') return true;
    if (this.state === 'connecting') return false;

    this.setState('connecting');

    return new Promise((resolve) => {
      this.socket = createConnection({ path: this.socketPath });

      const timeout = setTimeout(() => {
        this.socket?.destroy();
        this.socket = null;
        this.setState('disconnected');
        resolve(false);
      }, this.connectionTimeout);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.setState('connected');
        this.setupSocketListeners();
        this.emit('connect');
        resolve(true);
      });

      this.socket.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        this.setState('disconnected');
        if (err.code !== 'ENOENT' && err.code !== 'ECONNREFUSED') {
          this.emit('error', err);
        }
        resolve(false);
      });
    });
  }

  /**
   * Disconnect from the playground app (stops retry loop)
   */
  disconnect(reason = 'manual'): void {
    this.stopRetrying();
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    if (this.state !== 'disconnected') {
      this.setState('disconnected');
      this.emit('disconnect', reason);
    }
  }

  /**
   * Reset connection without stopping retry loop.
   * Use when you want to reconnect (e.g., handshake timeout).
   */
  resetConnection(reason = 'reset'): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.buffer = Buffer.alloc(0);
    if (this.state !== 'disconnected') {
      this.setState('disconnected');
      this.emit('disconnect', reason);
    }
    if (this.autoRetry && !this.disposed) {
      this.startRetrying();
    }
  }

  /**
   * Start background retry loop
   */
  startRetrying(): void {
    if (this.retryTimer || this.state === 'connected' || this.disposed) return;

    this.retryTimer = setInterval(async () => {
      if (this.disposed || this.state === 'connected') {
        this.stopRetrying();
        return;
      }
      const connected = await this.connect();
      if (connected) {
        this.stopRetrying();
      }
    }, this.retryInterval);
  }

  stopRetrying(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopRetrying();
    this.disconnect('disposed');
    this.removeAllListeners();
    this.outputBuffer = Buffer.alloc(0);
    this.buffer = Buffer.alloc(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MESSAGE SENDING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Send a message using length-prefixed MessagePack.
   * Returns true if sent, false if not connected.
   */
  send(msg: NamespacedMessage): boolean {
    if (!this.socket || this.state !== 'connected') {
      return false;
    }
    try {
      const frame = encodeMessage(msg);
      this.socket.write(frame);
      return true;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  /**
   * Buffer output data for later sending (used when disconnected)
   */
  bufferOutput(data: Buffer): void {
    const newBuffer = Buffer.concat([this.outputBuffer, data]);
    if (newBuffer.length > this.maxOutputBuffer) {
      this.outputBuffer = newBuffer.slice(-this.maxOutputBuffer);
    } else {
      this.outputBuffer = newBuffer;
    }
  }

  hasBufferedOutput(): boolean {
    return this.outputBuffer.length > 0;
  }

  getAndClearOutputBuffer(): Buffer {
    const buffer = this.outputBuffer;
    this.outputBuffer = Buffer.alloc(0);
    return buffer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────────────────

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', state);
    }
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);

      try {
        const { messages, remaining } = parseFrames(this.buffer);
        this.buffer = remaining;

        for (const msg of messages) {
          this.emit('message', msg);
        }
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
        this.buffer = Buffer.alloc(0);
      }

      if (this.buffer.length > this.maxOutputBuffer) {
        this.emit('error', new Error('Receive buffer overflow'));
        this.buffer = Buffer.alloc(0);
      }
    });

    this.socket.on('close', () => {
      this.setState('disconnected');
      this.socket = null;
      this.buffer = Buffer.alloc(0);
      this.emit('disconnect', 'socket closed');

      if (this.autoRetry && !this.disposed) {
        this.startRetrying();
      }
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });
  }
}

export function createTransport(options?: TransportOptions): Transport {
  return new Transport(options);
}
