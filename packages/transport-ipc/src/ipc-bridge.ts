/**
 * PTY-IPC Bridge - Wires IPC layer to PTY layer
 *
 * This bridge handles the connection between the IPC infrastructure layer
 * and the PTY business logic layer:
 * - Listens to an IPC server for connection events
 * - Creates IPCPTYTransport instances for new CLI connections
 * - Registers transports with PTYSessionManager
 * - Routes PTY namespace messages to transports
 *
 * NOTE: Unlike the original, this does NOT depend on Electron.
 * The IPC server interface is abstracted.
 */

import { EventEmitter } from 'events';
import type { RemoteSessionAnnounce } from '@avocado/types';
import {
  IPCPTYTransport,
  createIPCPTYTransport,
  type IMessageBus,
} from './ipc-transport.js';
import type { PTYSessionManager, ITerminalStoreSync } from '@avocado/core';

// ===============================================================================
// ABSTRACT IPC SERVER INTERFACE
// ===============================================================================

/**
 * Connection ready event from the IPC server
 */
export interface ConnectionReadyEvent {
  id: string;
  version?: string;
  pid?: number;
}

/**
 * Bus message format
 */
export interface BusMessage {
  from?: string;
  namespace: string;
  type: string;
  payload: unknown;
}

/**
 * Abstract IPC server interface. Consumers implement this for their
 * IPC mechanism (Unix Domain Socket, Named Pipe, WebSocket, etc.)
 */
export interface IIPCServer extends EventEmitter {
  getMessageBus(): IMessageBus | null;
  // Events:
  // 'connectionReady': (conn: ConnectionReadyEvent) => void
  // 'clientDisconnected': (data: { connectionId: string; reason: string }) => void
}

// ===============================================================================
// TYPES
// ===============================================================================

export interface PTYIPCBridgeEvents {
  transportCreated: (connectionId: string, transport: IPCPTYTransport) => void;
  transportRemoved: (connectionId: string, reason: string) => void;
}

export interface IPTYIPCBridge extends EventEmitter {
  initialize(ipcServer: IIPCServer): void;
  isInitialized(): boolean;
  getTransportCount(): number;
  getTransport(connectionId: string): IPCPTYTransport | null;
  getTransports(): Map<string, IPCPTYTransport>;
  setTerminalStoreSync(storeSync: ITerminalStoreSync): void;
  dispose(): void;

  on<K extends keyof PTYIPCBridgeEvents>(event: K, listener: PTYIPCBridgeEvents[K]): this;
  emit<K extends keyof PTYIPCBridgeEvents>(
    event: K,
    ...args: Parameters<PTYIPCBridgeEvents[K]>
  ): boolean;
}

// ===============================================================================
// IMPLEMENTATION
// ===============================================================================

const LOG_PREFIX = '[PTYIPCBridge]';

export class PTYIPCBridgeImpl extends EventEmitter implements IPTYIPCBridge {
  private ipcServer: IIPCServer | null = null;
  private ipcTransports: Map<string, IPCPTYTransport> = new Map();
  private sessionManager: PTYSessionManager;
  private unsubscribePty: (() => void) | null = null;
  private initialized: boolean = false;
  private terminalStoreSync: ITerminalStoreSync | null = null;
  private cliTerminalMap: Map<string, string> = new Map();

  private connectionReadyHandler: ((conn: ConnectionReadyEvent) => void) | null = null;
  private clientDisconnectedHandler: ((data: { connectionId: string; reason: string }) => void) | null = null;

  constructor(sessionManager: PTYSessionManager) {
    super();
    this.sessionManager = sessionManager;
  }

  setTerminalStoreSync(storeSync: ITerminalStoreSync): void {
    this.terminalStoreSync = storeSync;
    console.log(`${LOG_PREFIX} Terminal store sync set`);
  }

  // ---------------------------------------------------------------------------
  // LIFECYCLE
  // ---------------------------------------------------------------------------

  initialize(ipcServer: IIPCServer): void {
    if (this.initialized) {
      console.log(`${LOG_PREFIX} Already initialized`);
      return;
    }

    this.ipcServer = ipcServer;
    const messageBus = ipcServer.getMessageBus();
    if (!messageBus) {
      console.warn(`${LOG_PREFIX} Cannot initialize - IPC server not running`);
      return;
    }

    this.connectionReadyHandler = (conn: ConnectionReadyEvent) => {
      this.handleConnectionReady(conn, messageBus);
    };

    this.clientDisconnectedHandler = (data: { connectionId: string; reason: string }) => {
      this.handleClientDisconnected(data.connectionId, data.reason);
    };

    ipcServer.on('connectionReady', this.connectionReadyHandler);
    ipcServer.on('clientDisconnected', this.clientDisconnectedHandler);

    this.initialized = true;
    console.log(`${LOG_PREFIX} Initialized`);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  dispose(): void {
    if (this.unsubscribePty) {
      this.unsubscribePty();
      this.unsubscribePty = null;
    }

    if (this.ipcServer) {
      if (this.connectionReadyHandler) {
        this.ipcServer.off('connectionReady', this.connectionReadyHandler);
      }
      if (this.clientDisconnectedHandler) {
        this.ipcServer.off('clientDisconnected', this.clientDisconnectedHandler);
      }
    }

    for (const [connectionId, transport] of this.ipcTransports) {
      transport.dispose();
      this.sessionManager.unregisterTransport(connectionId);
      this.emit('transportRemoved', connectionId, 'bridge disposing');
    }
    this.ipcTransports.clear();

    this.connectionReadyHandler = null;
    this.clientDisconnectedHandler = null;
    this.ipcServer = null;
    this.initialized = false;

    this.removeAllListeners();
    console.log(`${LOG_PREFIX} Disposed`);
  }

  // ---------------------------------------------------------------------------
  // TRANSPORT MANAGEMENT
  // ---------------------------------------------------------------------------

  getTransportCount(): number {
    return this.ipcTransports.size;
  }

  getTransport(connectionId: string): IPCPTYTransport | null {
    return this.ipcTransports.get(connectionId) ?? null;
  }

  getTransports(): Map<string, IPCPTYTransport> {
    return new Map(this.ipcTransports);
  }

  // ---------------------------------------------------------------------------
  // EVENT HANDLERS
  // ---------------------------------------------------------------------------

  private handleConnectionReady(conn: ConnectionReadyEvent, messageBus: IMessageBus): void {
    const transport = createIPCPTYTransport(conn.id, messageBus, {
      version: conn.version,
      pid: conn.pid,
    });

    this.ipcTransports.set(conn.id, transport);
    this.sessionManager.registerTransport(transport);

    if (this.terminalStoreSync) {
      transport.on('sessionAnnounced', (announcement: RemoteSessionAnnounce) => {
        if (this.terminalStoreSync) {
          const namespacedSessionId = `ipc|${transport.transportId}|${announcement.sessionId}`;
          const cliTerminalId = this.terminalStoreSync.registerCliTerminal(
            namespacedSessionId,
            announcement.cols,
            announcement.rows
          );
          this.cliTerminalMap.set(conn.id, cliTerminalId);
          console.log(`${LOG_PREFIX} Registered CLI terminal ${cliTerminalId} for session ${namespacedSessionId.slice(0, 30)}`);
        }
      });
    }

    console.log(
      `${LOG_PREFIX} Created IPCPTYTransport for connection: ${conn.id.slice(0, 8)} version=${conn.version}`
    );

    this.emit('transportCreated', conn.id, transport);
  }

  private handleClientDisconnected(connectionId: string, reason: string): void {
    const transport = this.ipcTransports.get(connectionId);
    if (transport) {
      transport.handleDisconnected(reason);
      this.sessionManager.unregisterTransport(connectionId);
      this.ipcTransports.delete(connectionId);

      const cliTerminalId = this.cliTerminalMap.get(connectionId);
      if (cliTerminalId && this.terminalStoreSync) {
        this.terminalStoreSync.unregisterCliTerminal(cliTerminalId);
      }
      this.cliTerminalMap.delete(connectionId);

      this.emit('transportRemoved', connectionId, reason);
    }
  }
}

// ===============================================================================
// FACTORY
// ===============================================================================

export function createPTYIPCBridge(sessionManager: PTYSessionManager): IPTYIPCBridge {
  return new PTYIPCBridgeImpl(sessionManager);
}
