/**
 * IPCSessionHost — owner-side, multi-session IPC endpoint.
 *
 * The generalization of the CLI's single-session SyncClient: a process that
 * OWNS PTY sessions (a CLI wrapper, a runtime daemon, an agent host) connects
 * to a hub's UDSServer, announces any number of IPTYSessions, relays their
 * output, and routes inbound input/resize/kill back to them.
 *
 * With a `spawnHandler`, the host also accepts hub-initiated `spawn:request`
 * messages: the handler creates a session (however the host pleases — local
 * node-pty, a wrapped runtime, anything implementing IPTYSession), the host
 * announces it, then acknowledges with `spawn:response` carrying the session
 * id. The announce is sent before the response so the hub's proxy session
 * exists by the time the requester's promise resolves.
 *
 * Handshake, heartbeat, and payload shapes match UDSServer and
 * IPCPTYTransport (`hello` → `welcome`, 30s `heartbeat`, base64 output).
 * On reconnect every live session is re-announced; the hub side creates
 * fresh proxy sessions because the old transport died with the connection.
 */

import { EventEmitter } from 'events';
import type { IPTYSession } from '#types';
import { PTY_NAMESPACE, type NamespacedMessage } from './wire.js';
import { UDSClient } from './uds-client.js';
import type { SpawnRequestPayload, SpawnResponsePayload } from './ipc-transport.js';

const LOG_PREFIX = '[IPCSessionHost]';
const HEARTBEAT_INTERVAL_MS = 30_000;
const HOST_VERSION = '0.1.0';

/** Spawn configuration as received from the hub (requestId stripped). */
export type SpawnConfig = Omit<SpawnRequestPayload, 'requestId'>;

/**
 * Creates and returns a session for a hub spawn request. The returned session
 * is registered with the host automatically; throwing rejects the request.
 */
export type SpawnHandler = (config: SpawnConfig) => Promise<IPTYSession> | IPTYSession;

export interface IPCSessionHostOptions {
  socketPath: string;
  /** Reported in the hello handshake and announcements. */
  version?: string;
  /** Present to accept hub-initiated spawns; absent hosts reject them. */
  spawnHandler?: SpawnHandler;
  /** Announce metadata: project/workspace path shown by hub UIs. */
  projectPath?: string;
  autoRetry?: boolean;
  retryIntervalMs?: number;
}

export interface IPCSessionHostEvents {
  connect: [];
  disconnect: [reason: string];
  error: [err: Error];
  /** A hub spawn request was accepted and the session announced. */
  spawned: [session: IPTYSession];
}

export interface IPCSessionHost extends EventEmitter {
  on<K extends keyof IPCSessionHostEvents>(event: K, listener: (...args: IPCSessionHostEvents[K]) => void): this;
  off<K extends keyof IPCSessionHostEvents>(event: K, listener: (...args: IPCSessionHostEvents[K]) => void): this;
  emit<K extends keyof IPCSessionHostEvents>(event: K, ...args: IPCSessionHostEvents[K]): boolean;
}

interface HostedSession {
  session: IPTYSession;
  detach: () => void;
}

export class IPCSessionHost extends EventEmitter {
  private readonly options: IPCSessionHostOptions;
  private readonly client: UDSClient;
  private readonly hosted = new Map<string, HostedSession>();
  private handshakeComplete = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(options: IPCSessionHostOptions) {
    super();
    this.options = options;
    this.client = new UDSClient({
      socketPath: options.socketPath,
      autoRetry: options.autoRetry,
      retryIntervalMs: options.retryIntervalMs,
    });

    this.client.on('connect', () => this.sendHello());
    this.client.on('disconnect', (reason) => {
      this.handshakeComplete = false;
      this.stopHeartbeat();
      this.emit('disconnect', reason);
    });
    this.client.on('error', (err) => this.emit('error', err));
    this.client.on('message', (msg) => this.handleMessage(msg));
  }

  isConnected(): boolean {
    return this.client.isConnected() && this.handshakeComplete;
  }

  /** Resolves true when the socket is up (handshake completes asynchronously). */
  connect(): Promise<boolean> {
    return this.client.connect();
  }

  /**
   * Register a session with the host. Announced immediately when connected,
   * or on the next (re)connect. The host relays output and routes inbound
   * input/resize/kill; it does NOT own the session's lifecycle.
   */
  addSession(session: IPTYSession): void {
    if (this.hosted.has(session.id)) return;

    const onOutput = (data: Buffer): void => {
      this.send('output', { sessionId: session.id, data: data.toString('base64') });
    };
    const onExit = (code: number, signal?: string): void => {
      this.send('session:end', { sessionId: session.id, exitCode: code, signal });
      this.removeSession(session.id);
    };
    const onResized = (cols: number, rows: number): void => {
      this.send('resize', { sessionId: session.id, cols, rows });
    };

    session.on('output', onOutput);
    session.on('exit', onExit);
    session.on('resized', onResized);

    this.hosted.set(session.id, {
      session,
      detach: () => {
        session.off('output', onOutput);
        session.off('exit', onExit);
        session.off('resized', onResized);
      },
    });

    if (this.isConnected()) this.announce(session);
  }

  /** Stop hosting a session without touching the session itself. */
  removeSession(sessionId: string): void {
    const entry = this.hosted.get(sessionId);
    if (!entry) return;
    entry.detach();
    this.hosted.delete(sessionId);
  }

  getSessions(): IPTYSession[] {
    return Array.from(this.hosted.values(), (h) => h.session);
  }

  dispose(): void {
    this.disposed = true;
    this.stopHeartbeat();
    for (const entry of this.hosted.values()) entry.detach();
    this.hosted.clear();
    this.client.dispose();
    this.removeAllListeners();
  }

  // ─── outbound ─────────────────────────────────────────────────────────────

  private send(type: string, payload: unknown): boolean {
    const msg: NamespacedMessage = { namespace: PTY_NAMESPACE, type, payload, timestamp: Date.now() };
    return this.client.send(msg);
  }

  private sendHello(): void {
    this.send('hello', { version: this.options.version ?? HOST_VERSION, pid: process.pid });
  }

  private announce(session: IPTYSession): void {
    this.send('session:announce', {
      sessionId: session.id,
      pid: session.pid,
      command: session.command,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      cliVersion: this.options.version ?? HOST_VERSION,
      projectPath: this.options.projectPath,
    });
    // Seed the hub with scrollback accumulated before it attached (or while
    // it was away). New proxy sessions start empty on the hub side, so this
    // is a plain output message, not a special replay op.
    const buffered = session.getOutputBuffer();
    if (buffered && buffered.length > 0) {
      this.send('output', { sessionId: session.id, data: buffered.toString('base64') });
    }
  }

  // ─── inbound ──────────────────────────────────────────────────────────────

  private handleMessage(msg: NamespacedMessage): void {
    if (msg.namespace !== PTY_NAMESPACE) return;
    const payload = msg.payload as Record<string, unknown> | undefined;

    switch (msg.type) {
      case 'welcome': {
        this.handshakeComplete = true;
        this.startHeartbeat();
        for (const entry of this.hosted.values()) this.announce(entry.session);
        this.emit('connect');
        break;
      }
      case 'input': {
        const session = this.sessionFor(payload);
        if (session && typeof payload?.data === 'string') {
          session.write(Buffer.from(payload.data, 'base64'));
        }
        break;
      }
      case 'resize': {
        const session = this.sessionFor(payload);
        if (session && typeof payload?.cols === 'number' && typeof payload?.rows === 'number') {
          session.resize(payload.cols, payload.rows);
        }
        break;
      }
      case 'kill': {
        const session = this.sessionFor(payload);
        if (session) session.kill(typeof payload?.signal === 'string' ? payload.signal : undefined);
        break;
      }
      case 'spawn:request': {
        void this.handleSpawnRequest(payload as unknown as SpawnRequestPayload);
        break;
      }
      case 'heartbeat:ack':
      case 'focus':
        break;
      default:
        break;
    }
  }

  private sessionFor(payload: Record<string, unknown> | undefined): IPTYSession | null {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== 'string') return null;
    return this.hosted.get(sessionId)?.session ?? null;
  }

  private async handleSpawnRequest(payload: SpawnRequestPayload | undefined): Promise<void> {
    const requestId = payload?.requestId;
    if (typeof requestId !== 'string') return;

    const respond = (response: SpawnResponsePayload): void => {
      this.send('spawn:response', response);
    };

    if (!this.options.spawnHandler) {
      respond({ requestId, ok: false, error: 'spawn not supported by this host' });
      return;
    }
    if (typeof payload?.command !== 'string' || payload.command.length === 0) {
      respond({ requestId, ok: false, error: 'spawn request missing command' });
      return;
    }

    try {
      const { requestId: _ignored, ...config } = payload;
      const session = await this.options.spawnHandler(config);
      this.addSession(session); // announce precedes the response on purpose
      respond({ requestId, ok: true, sessionId: session.id });
      this.emit('spawned', session);
    } catch (err) {
      respond({ requestId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─── heartbeat ────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    if (this.heartbeatTimer || this.disposed) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) this.send('heartbeat', { timestamp: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export function createIPCSessionHost(options: IPCSessionHostOptions): IPCSessionHost {
  return new IPCSessionHost(options);
}
