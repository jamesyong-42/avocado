/**
 * IPCPTYTransport - IPTYTransport implementation for IPC connections
 *
 * Wraps an IPC connection to provide the IPTYTransport interface.
 * Used to manage proxy sessions from CLI connections.
 *
 * NOTE: Unlike the original, this does NOT depend on Electron.
 * The IMessageBus interface is abstracted - consumers provide their
 * own implementation for their IPC mechanism.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  IPTYTransport,
  TransportType,
  RemoteSessionAnnounce,
} from '#types';

// ===============================================================================
// ABSTRACT MESSAGE BUS INTERFACE
// ===============================================================================

/**
 * Minimal message bus interface for sending messages to a connection.
 * Consumers implement this for their IPC mechanism.
 */
export interface IMessageBus {
  publish(connectionId: string, namespace: string, type: string, payload: unknown): void;
}

// ===============================================================================
// TYPES
// ===============================================================================

interface SessionAnnouncePayload {
  sessionId: string;
  pid?: number;
  command: string;
  cwd: string;
  cols: number;
  rows: number;
  cliVersion?: string;
  projectPath?: string;
}

interface OutputPayload {
  sessionId: string;
  data: string; // base64 encoded
}

interface SessionEndPayload {
  sessionId: string;
  exitCode?: number;
  /** Terminating signal, when the owner's process died by signal. */
  signal?: string;
}

interface ResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

interface FocusPayload {
  sessionId: string;
  focused: boolean;
}

export interface IPCPTYTransportMetadata {
  version?: string;
  pid?: number;
}

export interface IPCPTYTransportOptions {
  /**
   * Rewrite output for line-mode CLI echo (strip focus-tracking sequences,
   * normalize newlines). Leave enabled for `avo`-style CLI sessions; disable
   * for byte-exact mirroring of full-screen TUIs, where any rewrite corrupts
   * cursor-addressed screens. Default: true (existing behavior).
   */
  normalizeOutput?: boolean;
}

/** Hub → owner: ask the session host to spawn a session (`spawn:request`). */
export interface SpawnRequestPayload {
  requestId: string;
  command: string;
  args?: string[];
  cwd?: string;
  /** Explicit env grants passed to the owner's spawn handler — never a full parent env. */
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  name?: string;
}

/** Owner → hub acknowledgment (`spawn:response`). The session itself arrives via `session:announce`. */
export interface SpawnResponsePayload {
  requestId: string;
  ok: boolean;
  sessionId?: string;
  error?: string;
}

interface PendingSpawn {
  resolve: (result: { sessionId: string }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ===============================================================================
// IPC PTY TRANSPORT IMPLEMENTATION
// ===============================================================================

const PTY_NAMESPACE = 'pty';
const LOG_PREFIX = '[IPCPTYTransport]';

export class IPCPTYTransport extends EventEmitter implements IPTYTransport {
  private _connectionId: string;
  private _messageBus: IMessageBus;
  private _isConnected: boolean = true;
  private _metadata?: IPCPTYTransportMetadata;
  private _normalizeOutput: boolean;
  private _pendingSpawns: Map<string, PendingSpawn> = new Map();

  constructor(
    connectionId: string,
    messageBus: IMessageBus,
    metadata?: IPCPTYTransportMetadata,
    options?: IPCPTYTransportOptions
  ) {
    super();
    this._connectionId = connectionId;
    this._messageBus = messageBus;
    this._metadata = metadata;
    this._normalizeOutput = options?.normalizeOutput ?? true;
  }

  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  get transportId(): string {
    return this._connectionId;
  }

  get transportType(): TransportType {
    return 'ipc';
  }

  // ---------------------------------------------------------------------------
  // Connection State
  // ---------------------------------------------------------------------------

  get isReady(): boolean {
    return this._isConnected;
  }

  get remoteVersion(): string | undefined {
    return this._metadata?.version;
  }

  get remotePid(): number | undefined {
    return this._metadata?.pid;
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  disconnect(reason?: string): void {
    if (!this._isConnected) {
      return;
    }
    this._isConnected = false;
    this.rejectPendingSpawns(`transport disconnected: ${reason ?? 'disconnect called'}`);
    this.emit('disconnected', reason ?? 'disconnect called');
  }

  dispose(): void {
    this.disconnect('disposed');
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Protocol Message Handling
  // ---------------------------------------------------------------------------

  /**
   * Handle incoming PTY session message from CLI
   */
  handleMessage(type: string, payload: unknown): void {
    switch (type) {
      case 'session:announce':
        this.handleSessionAnnounce(payload as SessionAnnouncePayload);
        break;
      case 'output':
        this.handleOutput(payload as OutputPayload);
        break;
      case 'session:end':
        this.handleSessionEnd(payload as SessionEndPayload);
        break;
      case 'resize':
        this.handleResize(payload as ResizePayload);
        break;
      case 'focus':
        this.handleFocus(payload as FocusPayload);
        break;
      case 'spawn:response':
        this.handleSpawnResponse(payload as SpawnResponsePayload);
        break;
      default:
        console.log(`${LOG_PREFIX} Unknown message type: ${type}`);
    }
  }

  private handleSessionAnnounce(payload: SessionAnnouncePayload): void {
    const announcement: RemoteSessionAnnounce = {
      sessionId: payload.sessionId,
      pid: payload.pid ?? 0,
      command: payload.command,
      cwd: payload.cwd,
      cols: payload.cols,
      rows: payload.rows,
      clientVersion: payload.cliVersion,
      projectPath: payload.projectPath,
    };

    this.emit('sessionAnnounced', announcement);
  }

  private handleOutput(payload: OutputPayload): void {
    try {
      const raw = Buffer.from(payload.data, 'base64');
      const data = this._normalizeOutput ? this.normalizeOutput(raw) : raw;
      this.emit('output', payload.sessionId, data);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error processing output:`, error);
    }
  }

  private handleSpawnResponse(payload: SpawnResponsePayload): void {
    const pending = this._pendingSpawns.get(payload.requestId);
    if (!pending) return;
    this._pendingSpawns.delete(payload.requestId);
    clearTimeout(pending.timer);
    if (payload.ok && payload.sessionId) {
      pending.resolve({ sessionId: payload.sessionId });
    } else {
      pending.reject(new Error(payload.error ?? 'spawn rejected by session host'));
    }
  }

  private normalizeOutput(data: Buffer): Buffer {
    if (!data.includes(0x0a) && !data.includes(0x1b)) {
      return data;
    }
    const text = data.toString('utf-8');
    const withoutFocus = text.replace(/\x1b\[I|\x1b\[O/g, '');
    if (!withoutFocus.includes('\n')) {
      return Buffer.from(withoutFocus, 'utf-8');
    }
    const normalized = withoutFocus.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    return Buffer.from(normalized, 'utf-8');
  }

  private handleSessionEnd(payload: SessionEndPayload): void {
    this.emit('sessionEnded', payload.sessionId, payload.exitCode ?? 0, payload.signal);
  }

  private handleResize(payload: ResizePayload): void {
    this.emit('resized', payload.sessionId, payload.cols, payload.rows);
  }

  private handleFocus(payload: FocusPayload): void {
    this.emit('focusChanged', payload.sessionId, payload.focused);
  }

  // ---------------------------------------------------------------------------
  // Outgoing Operations (Viewer -> Owner)
  // ---------------------------------------------------------------------------

  sendInput(sessionId: string, data: string | Buffer): void {
    if (!this.isReady) return;
    const encoded = typeof data === 'string' ? Buffer.from(data).toString('base64') : data.toString('base64');
    this._messageBus.publish(this._connectionId, PTY_NAMESPACE, 'input', {
      sessionId,
      data: encoded,
    });
  }

  sendResize(sessionId: string, cols: number, rows: number): void {
    if (!this.isReady) return;
    this._messageBus.publish(this._connectionId, PTY_NAMESPACE, 'resize', {
      sessionId,
      cols,
      rows,
    });
  }

  sendKill(sessionId: string, signal?: string): void {
    if (!this.isReady) return;
    this._messageBus.publish(this._connectionId, PTY_NAMESPACE, 'kill', {
      sessionId,
      signal,
    });
  }

  sendFocus(sessionId: string, focused: boolean): void {
    if (!this.isReady) return;
    this._messageBus.publish(this._connectionId, PTY_NAMESPACE, 'focus', {
      sessionId,
      focused,
    });
  }

  /**
   * Ask the connected session host to spawn a session. Resolves with the
   * remote (un-namespaced) session id once the host acknowledges; the session
   * itself arrives through the usual `session:announce` flow, which the host
   * sends before the acknowledgment.
   */
  requestSpawn(config: Omit<SpawnRequestPayload, 'requestId'>, timeoutMs = 15_000): Promise<{ sessionId: string }> {
    if (!this.isReady) {
      return Promise.reject(new Error('transport not connected'));
    }
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingSpawns.delete(requestId);
        reject(new Error(`spawn request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this._pendingSpawns.set(requestId, { resolve, reject, timer });
      this._messageBus.publish(this._connectionId, PTY_NAMESPACE, 'spawn:request', {
        requestId,
        ...config,
      });
    });
  }

  private rejectPendingSpawns(reason: string): void {
    for (const [, pending] of this._pendingSpawns) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this._pendingSpawns.clear();
  }

  // ---------------------------------------------------------------------------
  // Outgoing Operations (Owner -> Viewer) - stubs for interface compliance
  // ---------------------------------------------------------------------------

  sendOutput(_sessionId: string, _data: Buffer, _targetDeviceId: string): void {
    // No-op: IPC doesn't relay to remote viewers
  }

  sendResized(_sessionId: string, _cols: number, _rows: number, _targetDeviceId: string): void {
    // No-op: IPC doesn't relay to remote viewers
  }

  sendSessionEnded(_sessionId: string, _exitCode: number, _targetDeviceId: string): void {
    // No-op: IPC doesn't relay to remote viewers
  }

  sendFocusChanged(_sessionId: string, _focused: boolean, _targetDeviceId: string): void {
    // No-op: IPC doesn't relay to remote viewers
  }

  // ---------------------------------------------------------------------------
  // Handle Disconnection
  // ---------------------------------------------------------------------------

  /** Called when the underlying IPC connection is lost */
  handleDisconnected(reason: string): void {
    if (!this._isConnected) return;
    this._isConnected = false;
    this.rejectPendingSpawns(`transport disconnected: ${reason}`);
    this.emit('disconnected', reason);
  }
}

// ===============================================================================
// FACTORY
// ===============================================================================

export function createIPCPTYTransport(
  connectionId: string,
  messageBus: IMessageBus,
  metadata?: IPCPTYTransportMetadata,
  options?: IPCPTYTransportOptions
): IPCPTYTransport {
  return new IPCPTYTransport(connectionId, messageBus, metadata, options);
}
