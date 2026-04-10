/**
 * MeshPTYTransport — IPTYTransport implementation for mesh network
 *
 * Used for remote PTY sessions over the mesh network (truffle over Tailscale).
 * Implements the viewer role — viewing sessions from remote Desktop devices.
 *
 * Architecture:
 * - MeshPTYTransport is created when a connection to a remote device exists
 * - It receives session announcements from the owner device
 * - It forwards input/resize/kill to the owner via IMessageBus
 * - It emits output/resize/focus events to local consumers
 *
 * The transport is purely event-driven and relies solely on IMessageBus for
 * communication. Connection lifecycle is managed externally via
 * handleConnected / handleDisconnected.
 *
 * Ported from vibe-ctl's
 *   packages/desktop/src/main/services/foundation/pty/transports/mesh-pty-transport.ts
 */

import { EventEmitter } from 'events';
import type {
  IPTYTransport,
  TransportType,
  WSOutputPayload,
  WSResizedPayload,
  WSFocusChangedPayload,
  WSSessionCreatedPayload,
  WSCreateFailedPayload,
  WSSessionEndedPayload,
  WSSubscribePayload,
  WSCreateSessionPayload,
} from '@avocado/types';
import { WS_PTY_MESSAGE_TYPES } from '@avocado/types';

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE BUS INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal pub/sub message bus interface.
 *
 * In vibe-ctl this is backed by truffle's `NapiMessageBus`. In avocado, it is
 * a consumer-provided abstraction so the transport stays decoupled from the
 * `@vibecook/truffle` runtime (which includes a native Rust NAPI binary).
 *
 * TODO: unify with `@avocado/transport-ipc`'s `IMessageBus` once the shapes
 *       converge, and lift to `@avocado/types`. Current differences:
 *         - transport-ipc: `publish(...): void`
 *         - transport-truffle: `publish(...): boolean`
 */
export interface IMessageBus {
  /**
   * Publish a message to a target (device ID in the mesh case).
   * @returns true if the message was sent, false if the bus wasn't ready.
   */
  publish(target: string, namespace: string, type: string, payload: unknown): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[MeshPTYTransport]';
const PTY_NAMESPACE = 'pty';

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface MeshPTYTransportOptions {
  /** Device ID this transport connects to */
  deviceId: string;
  /** Reference to the MessageBus for sending messages */
  messageBus: IMessageBus;
  /** Optional device name for display */
  deviceName?: string;
  /** Initial connection state (defaults to true — transport created when connected) */
  isConnected?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESH PTY TRANSPORT IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mesh PTY Transport for remote PTY sessions (Viewer Role)
 *
 * Represents a connection to a remote Desktop device.
 * Receives session announcements and output, forwards input/control.
 */
export class MeshPTYTransport extends EventEmitter implements IPTYTransport {
  private _deviceId: string;
  private _deviceName: string;
  private _messageBus: IMessageBus;
  private _isReady: boolean;

  constructor(options: MeshPTYTransportOptions) {
    super();
    this._deviceId = options.deviceId;
    this._deviceName = options.deviceName ?? options.deviceId;
    this._messageBus = options.messageBus;
    // Default to ready — transport is created when connection exists
    this._isReady = options.isConnected ?? true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────────────────

  get transportId(): string {
    // Return deviceId as-is — no `ws:` prefix since source is tracked separately
    return this._deviceId;
  }

  get transportType(): TransportType {
    return 'ws';
  }

  get deviceId(): string {
    return this._deviceId;
  }

  get deviceName(): string {
    return this._deviceName;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection State
  // ─────────────────────────────────────────────────────────────────────────

  get isReady(): boolean {
    return this._isReady;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Management
  // ─────────────────────────────────────────────────────────────────────────

  disconnect(reason?: string): void {
    if (!this._isReady) {
      return;
    }
    this._isReady = false;
    this.emit('disconnected', reason ?? 'disconnect called');
  }

  dispose(): void {
    this.disconnect('disposed');
    this.removeAllListeners();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Incoming Message Handling (called by the mesh bridge)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Handle an incoming message from the remote device.
   * Called by the mesh bridge when a PTY-namespace message arrives.
   *
   * Session discovery is handled by Store Sync. Sessions are announced via the
   * `sessionAnnounced` event emitted externally (e.g. by RemoteSessionService).
   */
  handleMessage(type: string, payload: unknown): void {
    switch (type) {
      case WS_PTY_MESSAGE_TYPES.OUTPUT:
        this.handleOutput(payload as WSOutputPayload);
        break;
      case WS_PTY_MESSAGE_TYPES.RESIZED:
        this.handleResized(payload as WSResizedPayload);
        break;
      case WS_PTY_MESSAGE_TYPES.FOCUS_CHANGED:
        this.handleFocusChanged(payload as WSFocusChangedPayload);
        break;
      case WS_PTY_MESSAGE_TYPES.SESSION_ENDED:
        this.handleSessionEnded(payload as WSSessionEndedPayload);
        break;
      case WS_PTY_MESSAGE_TYPES.SESSION_CREATED:
        this.emit('sessionCreated', payload as WSSessionCreatedPayload);
        break;
      case WS_PTY_MESSAGE_TYPES.CREATE_FAILED:
        this.emit('createFailed', payload as WSCreateFailedPayload);
        break;
      default:
        console.warn(`${LOG_PREFIX} Unknown message type: ${type}`);
    }
  }

  private handleOutput(payload: WSOutputPayload): void {
    const data = Buffer.from(payload.data, 'base64');
    this.emit('output', payload.sessionId, data);
  }

  private handleResized(payload: WSResizedPayload): void {
    this.emit('resized', payload.sessionId, payload.cols, payload.rows);
  }

  private handleFocusChanged(payload: WSFocusChangedPayload): void {
    this.emit('focusChanged', payload.sessionId, payload.focused);
  }

  private handleSessionEnded(payload: WSSessionEndedPayload): void {
    this.emit('sessionEnded', payload.sessionId, payload.exitCode ?? 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Outgoing Operations (Viewer → Owner)
  // ─────────────────────────────────────────────────────────────────────────

  private send(type: string, payload: unknown): boolean {
    if (!this.isReady) {
      console.warn(`${LOG_PREFIX} Cannot send, not ready`);
      return false;
    }
    return this._messageBus.publish(this._deviceId, PTY_NAMESPACE, type, payload);
  }

  sendInput(sessionId: string, data: string | Buffer): void {
    const encoded =
      typeof data === 'string'
        ? Buffer.from(data).toString('base64')
        : data.toString('base64');
    this.send(WS_PTY_MESSAGE_TYPES.INPUT, { sessionId, data: encoded });
  }

  sendResize(sessionId: string, cols: number, rows: number): void {
    this.send(WS_PTY_MESSAGE_TYPES.RESIZE, { sessionId, cols, rows });
  }

  sendKill(sessionId: string, signal?: string): void {
    this.send(WS_PTY_MESSAGE_TYPES.KILL, { sessionId, signal });
  }

  sendFocus(sessionId: string, focused: boolean): void {
    // Send focus to owner — viewer is signaling that they gained/lost focus
    this.send(WS_PTY_MESSAGE_TYPES.FOCUS_CHANGED, { sessionId, focused });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Outgoing Operations (Owner → Viewer) — for relay mode
  // ─────────────────────────────────────────────────────────────────────────

  sendOutput(sessionId: string, data: Buffer, targetDeviceId: string): void {
    if (!this.isReady) {
      console.warn(`${LOG_PREFIX} Cannot sendOutput, not ready`);
      return;
    }
    const encoded = data.toString('base64');
    this._messageBus.publish(targetDeviceId, PTY_NAMESPACE, WS_PTY_MESSAGE_TYPES.OUTPUT, {
      sessionId,
      data: encoded,
    });
  }

  sendResized(sessionId: string, cols: number, rows: number, targetDeviceId: string): void {
    if (!this.isReady) return;
    this._messageBus.publish(targetDeviceId, PTY_NAMESPACE, WS_PTY_MESSAGE_TYPES.RESIZED, {
      sessionId,
      cols,
      rows,
    });
  }

  sendSessionEnded(sessionId: string, exitCode: number, targetDeviceId: string): void {
    if (!this.isReady) return;
    this._messageBus.publish(targetDeviceId, PTY_NAMESPACE, WS_PTY_MESSAGE_TYPES.SESSION_ENDED, {
      sessionId,
      exitCode,
    });
  }

  sendFocusChanged(sessionId: string, focused: boolean, targetDeviceId: string): void {
    if (!this.isReady) return;
    this._messageBus.publish(
      targetDeviceId,
      PTY_NAMESPACE,
      WS_PTY_MESSAGE_TYPES.FOCUS_CHANGED,
      { sessionId, focused }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mesh-Specific Methods
  // ─────────────────────────────────────────────────────────────────────────

  /** Subscribe to a remote session to start receiving output */
  subscribe(sessionId: string): void {
    this.send(WS_PTY_MESSAGE_TYPES.SUBSCRIBE, { sessionId } as WSSubscribePayload);
  }

  /** Unsubscribe from a remote session */
  unsubscribe(sessionId: string): void {
    this.send(WS_PTY_MESSAGE_TYPES.UNSUBSCRIBE, { sessionId });
  }

  /** Request creation of a new session on the remote device */
  createRemoteSession(options: WSCreateSessionPayload): void {
    this.send(WS_PTY_MESSAGE_TYPES.CREATE_SESSION, options);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection State Updates (called by the mesh bridge)
  // ─────────────────────────────────────────────────────────────────────────

  /** Mark transport as connected/ready */
  handleConnected(): void {
    this._isReady = true;
    this.emit('connected');
  }

  /** Mark transport as disconnected */
  handleDisconnected(reason: string): void {
    this._isReady = false;
    this.emit('disconnected', reason);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createMeshPTYTransport(options: MeshPTYTransportOptions): MeshPTYTransport {
  return new MeshPTYTransport(options);
}
