/**
 * UDSServer — Cross-platform IPC server (Unix Domain Socket / Named Pipe)
 *
 * Implements the IIPCServer interface for PTYIPCBridge.
 * Handles:
 * - net.createServer on UDS (macOS/Linux) or Named Pipe (Windows)
 * - Connection lifecycle (accept, track, close)
 * - Wire format decode/encode (length-prefixed MessagePack)
 * - Hello/welcome handshake (intercepted before routing)
 * - Heartbeat/heartbeat:ack (intercepted before routing)
 * - Namespace-based message routing to endpoint handlers
 * - Socket file cleanup (Unix only; named pipes auto-cleanup)
 *
 * Ported from p008-claude-on-the-go/packages/desktop IPCServiceImpl.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { Server, Socket, createServer } from 'net';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { IMessageBus } from './ipc-transport.js';
import type { ConnectionReadyEvent, IIPCServer } from './ipc-bridge.js';
import {
  encodeMessage,
  decodeFrame,
  HEADER_SIZE,
  PTY_NAMESPACE,
  type NamespacedMessage,
} from './wire.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const SERVER_VERSION = '0.1.0';
const MAX_BUFFER_SIZE = 1024 * 1024; // 1 MB
const LOG_PREFIX = '[UDSServer]';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UDSServerConfig {
  socketPath: string;
  maxConnections?: number;
  connectionTimeout?: number;
}

interface InternalConnection {
  id: string;
  socket: Socket;
  connectedAt: Date;
  buffer: Buffer;
  handshakeState: 'pending' | 'ready';
  remoteVersion?: string;
  remotePid?: number;
}

/**
 * Handler for namespace-routed messages.
 */
export type NamespaceHandler = (
  connectionId: string,
  message: { namespace: string; type: string; payload: unknown }
) => void;

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE BUS (inline — wraps UDSServer for IMessageBus)
// ═══════════════════════════════════════════════════════════════════════════

class UDSMessageBus implements IMessageBus {
  private server: UDSServer;

  constructor(server: UDSServer) {
    this.server = server;
  }

  publish(connectionId: string, namespace: string, type: string, payload: unknown): void {
    this.server.sendNamespaced(connectionId, namespace, type, payload);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UDS SERVER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class UDSServer extends EventEmitter implements IIPCServer {
  private server: Server | null = null;
  private connections: Map<string, InternalConnection> = new Map();
  private config: UDSServerConfig | null = null;
  private endpoints: Map<string, NamespaceHandler> = new Map();
  private messageBus: UDSMessageBus;

  constructor() {
    super();
    this.messageBus = new UDSMessageBus(this);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IIPCServer interface
  // ─────────────────────────────────────────────────────────────────────────

  getMessageBus(): IMessageBus | null {
    if (!this.server) return null;
    return this.messageBus;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  start(config: UDSServerConfig): void {
    if (this.server) {
      throw new Error('Server already running. Stop it first.');
    }

    this.config = config;

    // Ensure parent directory exists (Unix only)
    if (!this.isNamedPipe()) {
      const parentDir = dirname(config.socketPath);
      mkdirSync(parentDir, { recursive: true });

      // Clean up stale socket file
      if (existsSync(config.socketPath)) {
        unlinkSync(config.socketPath);
      }
    }

    this.server = createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.on('error', (error) => {
      console.error(`${LOG_PREFIX} Server error:`, error);
      this.emit('error', { error });
    });

    this.server.listen(config.socketPath, () => {
      console.log(`${LOG_PREFIX} Listening on ${config.socketPath}`);
      this.emit('listening', { socketPath: config.socketPath });
    });
  }

  stop(): void {
    // Close all connections
    for (const [id, conn] of this.connections) {
      conn.socket.destroy();
      this.connections.delete(id);
      this.emit('clientDisconnected', { connectionId: id, reason: 'server_shutdown' });
    }

    // Close server
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Clean up socket file (Unix only)
    if (!this.isNamedPipe() && this.config?.socketPath && existsSync(this.config.socketPath)) {
      unlinkSync(this.config.socketPath);
    }

    this.config = null;
  }

  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  dispose(): void {
    this.stop();
    this.endpoints.clear();
    this.removeAllListeners();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PLATFORM DETECTION
  // ─────────────────────────────────────────────────────────────────────────

  isNamedPipe(): boolean {
    return process.platform === 'win32';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONNECTIONS
  // ─────────────────────────────────────────────────────────────────────────

  getConnectionCount(): number {
    return this.connections.size;
  }

  closeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.socket.destroy();
      this.connections.delete(connectionId);
      this.emit('clientDisconnected', { connectionId, reason: 'closed_by_server' });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NAMESPACE ROUTING
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a namespace endpoint handler.
   * Returns an unsubscribe function.
   */
  registerEndpoint(namespace: string, handler: NamespaceHandler): () => void {
    this.endpoints.set(namespace, handler);
    return () => {
      this.endpoints.delete(namespace);
    };
  }

  /**
   * Send a namespaced message to a specific connection using MessagePack framing.
   */
  sendNamespaced(connectionId: string, namespace: string, type: string, payload?: unknown): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn || conn.socket.destroyed) {
      return false;
    }

    const message: NamespacedMessage = {
      namespace,
      type,
      payload,
      timestamp: Date.now(),
    };

    try {
      const frame = encodeMessage(message);
      conn.socket.write(frame);
      return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} Send error:`, error);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONNECTION HANDLING (PRIVATE)
  // ─────────────────────────────────────────────────────────────────────────

  private handleConnection(socket: Socket): void {
    // Check max connections
    if (this.config?.maxConnections && this.connections.size >= this.config.maxConnections) {
      socket.destroy();
      return;
    }

    const connectionId = randomUUID();
    const connection: InternalConnection = {
      id: connectionId,
      socket,
      connectedAt: new Date(),
      buffer: Buffer.alloc(0),
      handshakeState: 'pending',
    };

    this.connections.set(connectionId, connection);

    // Connection timeout
    if (this.config?.connectionTimeout) {
      socket.setTimeout(this.config.connectionTimeout);
      socket.on('timeout', () => {
        this.closeConnection(connectionId);
      });
    }

    console.log(`${LOG_PREFIX} Client connected: ${connectionId.slice(0, 8)}`);

    socket.on('data', (data: Buffer) => {
      this.handleData(connectionId, data);
    });

    socket.on('close', () => {
      this.connections.delete(connectionId);
      this.emit('clientDisconnected', { connectionId, reason: 'client_closed' });
      console.log(`${LOG_PREFIX} Client disconnected: ${connectionId.slice(0, 8)}`);
    });

    socket.on('error', (error) => {
      console.error(`${LOG_PREFIX} Connection error (${connectionId.slice(0, 8)}):`, error);
      this.connections.delete(connectionId);
    });
  }

  private handleData(connectionId: string, data: Buffer): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    conn.buffer = Buffer.concat([conn.buffer, data]);

    // Process complete frames
    while (conn.buffer.length >= HEADER_SIZE) {
      try {
        const result = decodeFrame(conn.buffer);
        if (!result) {
          break; // Incomplete frame
        }

        const { message, bytesConsumed } = result;
        conn.buffer = conn.buffer.subarray(bytesConsumed);

        // Intercept management messages before routing
        if (message.namespace === PTY_NAMESPACE) {
          if (message.type === 'hello') {
            this.handleHello(connectionId, message.payload as { version: string; pid?: number });
            continue;
          }
          if (message.type === 'heartbeat') {
            this.handleHeartbeat(connectionId, message.payload as { sessionId?: string; timestamp?: number });
            continue;
          }
        }

        // Route to namespace handler
        const handler = this.endpoints.get(message.namespace);
        if (handler) {
          try {
            handler(connectionId, {
              namespace: message.namespace,
              type: message.type,
              payload: message.payload,
            });
          } catch (error) {
            console.error(`${LOG_PREFIX} Handler error for ${message.namespace}:${message.type}:`, error);
          }
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Protocol error (${connectionId.slice(0, 8)}):`, error);
        conn.buffer = Buffer.alloc(0);
        this.closeConnection(connectionId);
        break;
      }
    }

    // Prevent buffer overflow
    if (conn.buffer.length > MAX_BUFFER_SIZE) {
      console.error(`${LOG_PREFIX} Buffer overflow for ${connectionId.slice(0, 8)}`);
      conn.buffer = Buffer.alloc(0);
    }
  }

  private handleHello(connectionId: string, payload: { version: string; pid?: number }): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    conn.remoteVersion = payload.version;
    conn.remotePid = payload.pid;
    conn.handshakeState = 'ready';

    // Send welcome response
    this.sendNamespaced(connectionId, PTY_NAMESPACE, 'welcome', {
      desktopVersion: SERVER_VERSION,
    });

    // Emit connectionReady for PTYIPCBridge
    const readyEvent: ConnectionReadyEvent = {
      id: connectionId,
      version: payload.version,
      pid: payload.pid,
    };
    this.emit('connectionReady', readyEvent);

    console.log(
      `${LOG_PREFIX} Handshake completed: ${connectionId.slice(0, 8)} version=${payload.version}`
    );
  }

  private handleHeartbeat(connectionId: string, payload: { sessionId?: string; timestamp?: number }): void {
    this.sendNamespaced(connectionId, PTY_NAMESPACE, 'heartbeat:ack', {
      timestamp: Date.now(),
      receivedTimestamp: payload.timestamp,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createUDSServer(): UDSServer {
  return new UDSServer();
}
