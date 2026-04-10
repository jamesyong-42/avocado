/**
 * PTYSessionManager - Unified PTY session management
 *
 * Manages all PTY sessions uniformly using the IPTYSession interface:
 * - LocalPTYSession: Direct node-pty control
 * - ProxyPTYSession: Remote sessions via transports
 *
 * NOTE: Unlike the original, this does NOT import node-pty directly.
 * Use @avocado/node-pty for local session spawning. The spawn() method
 * accepts a spawn function via constructor injection.
 */

import { EventEmitter } from 'events';
import type {
  IPTYSession,
  IPTYTransport,
  SessionSource,
  PTYSpawnOptions,
  PTYSessionState,
  RemoteSessionAnnounce,
  IPCSessionMetadata,
  WSSessionMetadata,
} from '@avocado/types';
import {
  createNamespacedId,
  parseNamespacedId,
} from '@avocado/types';

// ===============================================================================
// TYPES
// ===============================================================================

export interface SessionDiscoveredEvent {
  session: IPTYSession;
  source: SessionSource;
}

export interface SessionLostEvent {
  sessionId: string;
  source: SessionSource;
  reason: string;
}

export interface SessionOutputEvent {
  sessionId: string;
  data: Buffer;
}

export interface SessionExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: string;
}

export interface SessionResizedEvent {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface SessionFocusChangedEvent {
  sessionId: string;
  focused: boolean;
}

/**
 * Function type for creating proxy sessions.
 * Provided externally so core doesn't need to import ProxyPTYSession directly.
 */
export type ProxySessionFactory = (
  transport: IPTYTransport,
  options: {
    id: string;
    source: SessionSource;
    remoteSessionId: string;
    pid: number;
    command: string;
    cwd: string;
    cols: number;
    rows: number;
    metadata: IPCSessionMetadata | WSSessionMetadata;
  }
) => IPTYSession;

// ===============================================================================
// PTY SESSION MANAGER
// ===============================================================================

const LOG_PREFIX = '[PTYSessionManager]';

export class PTYSessionManager extends EventEmitter {
  private sessions: Map<string, IPTYSession> = new Map();
  private transports: Map<string, IPTYTransport> = new Map();
  private transportSessions: Map<string, Set<string>> = new Map();
  private proxySessionFactory: ProxySessionFactory | null = null;

  /**
   * Set the factory used to create proxy sessions from transport announcements.
   */
  setProxySessionFactory(factory: ProxySessionFactory): void {
    this.proxySessionFactory = factory;
  }

  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  /**
   * Register a session (local or proxy)
   */
  registerSession(session: IPTYSession): void {
    if (this.sessions.has(session.id)) {
      console.log(`${LOG_PREFIX} Session already registered: ${session.id.slice(0, 20)}`);
      return;
    }

    this.sessions.set(session.id, session);

    // Set up event forwarding
    session.on('output', (data: Buffer) => {
      this.emit('output', { sessionId: session.id, data });
    });

    session.on('exit', (code: number, signal?: string) => {
      this.emit('exit', { sessionId: session.id, exitCode: code, signal });
      this.sessions.delete(session.id);
    });

    session.on('resized', (cols: number, rows: number) => {
      this.emit('sessionResized', { sessionId: session.id, cols, rows });
    });

    session.on('focusChanged', (focused: boolean) => {
      this.emit('sessionFocusChanged', { sessionId: session.id, focused });
    });

    session.on('disposed', () => {
      this.sessions.delete(session.id);
    });

    // Emit discovered event
    this.emit('sessionDiscovered', {
      session,
      source: session.source,
    });

    console.log(
      `${LOG_PREFIX} Session registered: ${session.id.slice(0, 20)} source=${session.source} command=${session.command}`
    );
  }

  /** Get a session by ID */
  getSession(sessionId: string): IPTYSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /** Get all sessions */
  getSessions(): IPTYSession[] {
    return Array.from(this.sessions.values());
  }

  /** Get sessions by source */
  getSessionsBySource(source: SessionSource): IPTYSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.source === source);
  }

  /** Get session info */
  getSessionInfo(sessionId: string): PTYSessionState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      source: session.source,
      pid: session.pid,
      command: session.command,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      startedAt: session.startedAt,
      exitCode: session.exitCode,
      isRunning: session.isRunning,
      isFocused: session.isFocused,
    };
  }

  /** Get all session infos */
  getAllSessionInfos(): PTYSessionState[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      source: s.source,
      pid: s.pid,
      command: s.command,
      cwd: s.cwd,
      cols: s.cols,
      rows: s.rows,
      startedAt: s.startedAt,
      exitCode: s.exitCode,
      isRunning: s.isRunning,
      isFocused: s.isFocused,
    }));
  }

  // ---------------------------------------------------------------------------
  // Session Operations
  // ---------------------------------------------------------------------------

  /** Write to a session */
  write(sessionId: string, data: string | Buffer): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isRunning) {
      return false;
    }
    session.write(data);
    return true;
  }

  /** Resize a session */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isRunning) {
      return false;
    }
    session.resize(cols, rows);
    return true;
  }

  /** Kill a session */
  kill(sessionId: string, signal?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isRunning) {
      return false;
    }
    session.kill(signal);
    return true;
  }

  /** Get output buffer */
  getOutputBuffer(sessionId: string, maxBytes?: number): Buffer | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.getOutputBuffer(maxBytes);
  }

  // ---------------------------------------------------------------------------
  // Transport Management
  // ---------------------------------------------------------------------------

  /**
   * Register a transport
   *
   * When a transport is registered, the manager will automatically:
   * - Listen for session announcements
   * - Create proxy sessions for announced sessions
   * - Forward events between transport and sessions
   */
  registerTransport(transport: IPTYTransport): void {
    if (this.transports.has(transport.transportId)) {
      console.log(`${LOG_PREFIX} Transport already registered: ${transport.transportId.slice(0, 8)}`);
      return;
    }

    this.transports.set(transport.transportId, transport);
    this.transportSessions.set(transport.transportId, new Set());

    // Handle session announcements
    transport.on('sessionAnnounced', (announcement: RemoteSessionAnnounce) => {
      this.handleSessionAnnounced(transport, announcement);
    });

    // Handle session ended
    transport.on('sessionEnded', (sessionId: string, exitCode: number) => {
      this.handleSessionEnded(transport, sessionId, exitCode);
    });

    // Handle disconnection
    transport.on('disconnected', (reason: string) => {
      this.handleTransportDisconnected(transport, reason);
    });

    console.log(
      `${LOG_PREFIX} Transport registered: ${transport.transportId.slice(0, 8)} type=${transport.transportType}`
    );
  }

  /** Unregister a transport */
  unregisterTransport(transportId: string): void {
    const transport = this.transports.get(transportId);
    if (!transport) return;

    const sessionIds = this.transportSessions.get(transportId);
    if (sessionIds) {
      for (const sessionId of sessionIds) {
        const session = this.sessions.get(sessionId);
        if (session) {
          session.dispose();
          this.sessions.delete(sessionId);
          this.emit('sessionLost', {
            sessionId,
            source: transport.transportType,
            reason: 'transport_unregistered',
          });
        }
      }
    }

    this.transports.delete(transportId);
    this.transportSessions.delete(transportId);

    console.log(`${LOG_PREFIX} Transport unregistered: ${transportId.slice(0, 8)}`);
  }

  /** Get a transport by ID */
  getTransport(transportId: string): IPTYTransport | null {
    return this.transports.get(transportId) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Transport Event Handlers
  // ---------------------------------------------------------------------------

  private handleSessionAnnounced(transport: IPTYTransport, announcement: RemoteSessionAnnounce): void {
    if (!this.proxySessionFactory) {
      console.warn(`${LOG_PREFIX} No proxy session factory set, cannot create proxy session`);
      return;
    }

    const source: SessionSource = transport.transportType;
    const namespacedId = createNamespacedId(source, transport.transportId, announcement.sessionId);

    if (this.sessions.has(namespacedId)) {
      console.log(`${LOG_PREFIX} Session already exists: ${namespacedId.slice(0, 20)}`);
      return;
    }

    let metadata: IPCSessionMetadata | WSSessionMetadata;
    if (source === 'ipc') {
      metadata = {
        connectionId: transport.transportId,
        pid: announcement.pid,
        cliVersion: announcement.clientVersion,
        projectPath: announcement.projectPath,
      };
    } else {
      metadata = {
        deviceId: transport.transportId,
        clientVersion: announcement.clientVersion,
        projectPath: announcement.projectPath,
      };
    }

    const session = this.proxySessionFactory(transport, {
      id: namespacedId,
      source,
      remoteSessionId: announcement.sessionId,
      pid: announcement.pid,
      command: announcement.command,
      cwd: announcement.cwd,
      cols: announcement.cols,
      rows: announcement.rows,
      metadata,
    });

    this.transportSessions.get(transport.transportId)?.add(namespacedId);
    this.registerSession(session);
  }

  private handleSessionEnded(transport: IPTYTransport, remoteSessionId: string, _exitCode: number): void {
    const source: SessionSource = transport.transportType;
    const namespacedId = createNamespacedId(source, transport.transportId, remoteSessionId);

    const session = this.sessions.get(namespacedId);
    if (!session) return;

    this.transportSessions.get(transport.transportId)?.delete(namespacedId);

    session.dispose();
    this.sessions.delete(namespacedId);

    this.emit('sessionLost', {
      sessionId: namespacedId,
      source,
      reason: 'session_ended',
    });
  }

  private handleTransportDisconnected(transport: IPTYTransport, reason: string): void {
    const sessionIds = this.transportSessions.get(transport.transportId);
    if (!sessionIds) return;

    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.dispose();
        this.sessions.delete(sessionId);
        this.emit('sessionLost', {
          sessionId,
          source: transport.transportType,
          reason: `transport_disconnected: ${reason}`,
        });
      }
    }

    sessionIds.clear();
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Get the transport ID for a session */
  getTransportIdForSession(sessionId: string): string | null {
    const parsed = parseNamespacedId(sessionId);
    return parsed?.connectionId ?? null;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /** Dispose all sessions and transports */
  dispose(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();

    for (const transport of this.transports.values()) {
      transport.dispose();
    }
    this.transports.clear();
    this.transportSessions.clear();

    this.removeAllListeners();
  }
}

// ===============================================================================
// FACTORY
// ===============================================================================

export function createPTYSessionManager(): PTYSessionManager {
  return new PTYSessionManager();
}
