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
import type {
  IPTYTransport,
  TransportType,
  RemoteSessionAnnounce,
} from '@avocado/types';

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

  constructor(connectionId: string, messageBus: IMessageBus, metadata?: IPCPTYTransportMetadata) {
    super();
    this._connectionId = connectionId;
    this._messageBus = messageBus;
    this._metadata = metadata;
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
      const data = this.normalizeOutput(Buffer.from(payload.data, 'base64'));
      this.emit('output', payload.sessionId, data);
    } catch (error) {
      console.error(`${LOG_PREFIX} Error processing output:`, error);
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
    this.emit('sessionEnded', payload.sessionId, payload.exitCode ?? 0);
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
    this.emit('disconnected', reason);
  }
}

// ===============================================================================
// FACTORY
// ===============================================================================

export function createIPCPTYTransport(
  connectionId: string,
  messageBus: IMessageBus,
  metadata?: IPCPTYTransportMetadata
): IPCPTYTransport {
  return new IPCPTYTransport(connectionId, messageBus, metadata);
}
