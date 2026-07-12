/**
 * UDSClient — owner-side IPC socket client (Unix Domain Socket / Named Pipe).
 *
 * The counterpart of UDSServer: connects to a hub, speaks the length-prefixed
 * MessagePack wire format, and emits decoded NamespacedMessages. Connection
 * retry is built in so a session host can outlive hub restarts.
 *
 * This is transport plumbing only — handshake, announcements, and session
 * semantics live in IPCSessionHost.
 */

import { EventEmitter } from 'events';
import { Socket, createConnection } from 'net';
import { decodeFrame, encodeMessage, HEADER_SIZE, type NamespacedMessage } from './wire.js';

const LOG_PREFIX = '[UDSClient]';
const MAX_BUFFER_SIZE = 1024 * 1024;
const DEFAULT_RETRY_INTERVAL_MS = 5_000;

export interface UDSClientOptions {
  socketPath: string;
  /** Reconnect automatically after connection loss (default: true). */
  autoRetry?: boolean;
  retryIntervalMs?: number;
}

export interface UDSClientEvents {
  connect: [];
  disconnect: [reason: string];
  message: [msg: NamespacedMessage];
  error: [err: Error];
}

export interface UDSClient extends EventEmitter {
  on<K extends keyof UDSClientEvents>(event: K, listener: (...args: UDSClientEvents[K]) => void): this;
  off<K extends keyof UDSClientEvents>(event: K, listener: (...args: UDSClientEvents[K]) => void): this;
  emit<K extends keyof UDSClientEvents>(event: K, ...args: UDSClientEvents[K]): boolean;
}

export class UDSClient extends EventEmitter {
  private readonly options: UDSClientOptions;
  private socket: Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(options: UDSClientOptions) {
    super();
    this.options = options;
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  /** Resolves true once connected, false if the attempt failed. */
  connect(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.isConnected()) return Promise.resolve(true);

    return new Promise((resolve) => {
      const socket = createConnection(this.options.socketPath);

      const onConnect = (): void => {
        socket.off('error', onError);
        this.adopt(socket);
        resolve(true);
      };
      const onError = (err: Error): void => {
        socket.off('connect', onConnect);
        socket.destroy();
        this.scheduleRetry(`connect failed: ${err.message}`);
        resolve(false);
      };

      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
  }

  send(msg: NamespacedMessage): boolean {
    if (!this.isConnected()) return false;
    try {
      this.socket!.write(encodeMessage(msg));
      return true;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  disconnect(reason = 'manual'): void {
    this.cancelRetry();
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.destroy();
      this.emit('disconnect', reason);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect('disposed');
    this.removeAllListeners();
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private adopt(socket: Socket): void {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);

    socket.on('data', (data: Buffer) => this.handleData(data));
    socket.on('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        this.emit('disconnect', 'socket closed');
        this.scheduleRetry('socket closed');
      }
    });
    socket.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.emit('connect');
  }

  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= HEADER_SIZE) {
      let result;
      try {
        result = decodeFrame(this.buffer);
      } catch (err) {
        console.error(`${LOG_PREFIX} Protocol error:`, err);
        this.buffer = Buffer.alloc(0);
        this.disconnect('protocol error');
        return;
      }
      if (!result) break;
      this.buffer = this.buffer.subarray(result.bytesConsumed);
      this.emit('message', result.message);
    }

    if (this.buffer.length > MAX_BUFFER_SIZE) {
      console.error(`${LOG_PREFIX} Buffer overflow`);
      this.buffer = Buffer.alloc(0);
      this.disconnect('buffer overflow');
    }
  }

  private scheduleRetry(reason: string): void {
    if (this.disposed || this.options.autoRetry === false || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, this.options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS);
    console.log(`${LOG_PREFIX} Will retry (${reason})`);
  }

  private cancelRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

export function createUDSClient(options: UDSClientOptions): UDSClient {
  return new UDSClient(options);
}
