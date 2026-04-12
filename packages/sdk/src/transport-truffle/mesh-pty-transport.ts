/**
 * MeshPTYTransport — IPTYTransport over a truffle mesh peer.
 *
 * One `MeshPTYTransport` represents the link to a single remote peer. The
 * transport handles both sides of the viewer/owner protocol:
 *
 *   Viewer (this device) → Owner (remote peer)
 *     sendInput, sendResize, sendKill, sendFocus, subscribe, unsubscribe
 *
 *   Owner (this device) → Viewer (remote peer)
 *     sendOutput, sendResized, sendSessionEnded, sendFocusChanged
 *
 * The transport subscribes to the shared `'pty'` namespace exactly once at
 * construction and filters incoming messages by `msg.from === this.peerId`.
 * Outgoing messages are encoded as `Buffer.from(JSON.stringify(obj))` where
 * `obj.type` is a `WS_PTY_MESSAGE_TYPES` discriminator and the rest of the
 * object carries the message-specific fields. Truffle decodes the JSON on
 * the receive side automatically — `msg.payload` is already a plain JS
 * object.
 *
 * Ported from vibe-ctl's
 *   packages/desktop/src/main/services/foundation/pty/transports/mesh-pty-transport.ts
 * and rewritten to talk to `NapiNode` directly instead of an `IMessageBus`
 * abstraction.
 */

import { EventEmitter } from 'events';
import type { NapiNode, NapiNamespacedMessage } from '@vibecook/truffle';
import type {
  IPTYTransport,
  TransportType,
  WSOutputPayload,
  WSResizedPayload,
  WSFocusChangedPayload,
  WSSessionEndedPayload,
  WSSubscribePayload,
  WSCreateSessionPayload,
} from '#types';
import { WS_PTY_MESSAGE_TYPES } from '#types';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[MeshPTYTransport]';

/**
 * Shared truffle namespace for all PTY mesh traffic.
 *
 * Every PTY message — viewer→owner and owner→viewer — is published on this
 * namespace. Truffle routes messages by (peer, namespace); the `payload.type`
 * field discriminates between message kinds within the namespace.
 */
export const PTY_NAMESPACE = 'pty';

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface MeshPTYTransportOptions {
  /** Truffle node that owns the underlying connection. */
  node: NapiNode;
  /** Stable peer ID this transport targets. */
  peerId: string;
  /** Optional display name (defaults to peerId). */
  peerName?: string;
  /**
   * Initial connection state.
   * Defaults to true — the bridge only constructs a transport once the peer
   * is WebSocket-connected.
   */
  isConnected?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// WIRE-FORMAT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal shape every wire message is expected to have. The `type` field is
 * the `WS_PTY_MESSAGE_TYPES` discriminator; all other fields are
 * message-specific and typed at the call site.
 */
interface PTYWireMessage {
  type: string;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESH PTY TRANSPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mesh PTY transport for a single truffle peer.
 *
 * Implements the full `IPTYTransport` surface — both viewer-side and
 * owner-side operations — because a single peer connection is used in both
 * directions for relay mode.
 */
export class MeshPTYTransport extends EventEmitter implements IPTYTransport {
  private readonly _node: NapiNode;
  private readonly _peerId: string;
  private readonly _peerName: string;
  private _isReady: boolean;
  private _disposed: boolean = false;
  private _messageHandler: (msg: NapiNamespacedMessage) => void;

  constructor(options: MeshPTYTransportOptions) {
    super();
    this._node = options.node;
    this._peerId = options.peerId;
    this._peerName = options.peerName ?? options.peerId;
    this._isReady = options.isConnected ?? true;

    // Install a single namespace listener at construction time. Truffle's
    // `onMessage` is global per namespace — the callback fires for every
    // message on 'pty' regardless of sender — so we filter by `msg.from`
    // against our peerId to only process messages from our peer.
    //
    // Note: `NapiNode.onMessage` returns void (see @vibecook/truffle-native
    // index.d.ts); there is no explicit unsubscribe primitive. We guard
    // against post-dispose dispatch with the `_disposed` flag instead.
    this._messageHandler = (msg: NapiNamespacedMessage): void => {
      if (this._disposed) return;
      if (msg.from !== this._peerId) return;
      this.handleIncoming(msg);
    };
    this._node.onMessage(PTY_NAMESPACE, this._messageHandler);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────────────────

  get transportId(): string {
    // The peer ID is the stable mesh identifier — also the transportId so
    // `PTYSessionManager` can look us up by peerId when routing.
    return this._peerId;
  }

  get transportType(): TransportType {
    return 'ws';
  }

  /** Convenience accessor — same as `transportId`, kept for clarity. */
  get peerId(): string {
    return this._peerId;
  }

  /** Human-readable name for logs and the UI. */
  get peerName(): string {
    return this._peerName;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection State
  // ─────────────────────────────────────────────────────────────────────────

  get isReady(): boolean {
    return this._isReady && !this._disposed;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Management
  // ─────────────────────────────────────────────────────────────────────────

  disconnect(reason?: string): void {
    if (!this._isReady) return;
    this._isReady = false;
    this.emit('disconnected', reason ?? 'disconnect called');
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    // Flip ready first so in-flight sends bail, then emit disconnected so
    // PTYSessionManager unwinds any proxy sessions that were associated
    // with this transport.
    if (this._isReady) {
      this._isReady = false;
      this.emit('disconnected', 'disposed');
    }
    this.removeAllListeners();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Incoming message dispatch
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Dispatch a message already filtered to this peer.
   *
   * `msg.payload` is a JSON object truffle decoded on the receive side
   * (not a Buffer) — calling `JSON.parse` on it throws. We cast through
   * `PTYWireMessage` and pick out the `type` discriminator.
   */
  private handleIncoming(msg: NapiNamespacedMessage): void {
    const payload = msg.payload as PTYWireMessage | null | undefined;
    if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') {
      console.warn(`${LOG_PREFIX} [${this._peerId}] dropped malformed payload`);
      return;
    }

    const type = payload.type;
    switch (type) {
      // ─── Owner → Viewer (inbound to us as viewer) ──────────────────────
      case WS_PTY_MESSAGE_TYPES.OUTPUT: {
        const p = payload as unknown as WSOutputPayload;
        const data = Buffer.from(p.data, 'base64');
        this.emit('output', p.sessionId, data);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.RESIZED: {
        const p = payload as unknown as WSResizedPayload;
        this.emit('resized', p.sessionId, p.cols, p.rows);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.FOCUS_CHANGED: {
        const p = payload as unknown as WSFocusChangedPayload;
        this.emit('focusChanged', p.sessionId, p.focused);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.SESSION_ENDED: {
        const p = payload as unknown as WSSessionEndedPayload;
        this.emit('sessionEnded', p.sessionId, p.exitCode ?? 0);
        return;
      }

      // ─── Viewer → Owner (inbound to us as owner) ──────────────────────
      // RemoteSessionService subscribes to the namespace directly for these
      // owner-side messages, but we also re-emit them as command events so
      // any consumer bound to a specific transport can react.
      case WS_PTY_MESSAGE_TYPES.INPUT: {
        const p = payload as unknown as { sessionId: string; data: string };
        const data = Buffer.from(p.data, 'base64');
        this.emit('inputReceived', p.sessionId, data);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.RESIZE: {
        const p = payload as unknown as { sessionId: string; cols: number; rows: number };
        this.emit('resizeRequested', p.sessionId, p.cols, p.rows);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.KILL: {
        const p = payload as unknown as { sessionId: string; signal?: string };
        this.emit('killRequested', p.sessionId, p.signal);
        return;
      }

      // Session discovery is handled by the SyncedStore, not by messaging.
      // `sessionAnnounced` is emitted by RemoteSessionService when it
      // reconciles the remote slice of the PTY sync store.
      default:
        // Unknown types are ignored — could be a forward-compatible message
        // from a newer peer.
        return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Outgoing sends
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Serialize and publish a wire message to this transport's peer.
   *
   * Sends are fire-and-forget from the IPTYTransport contract's POV (the
   * signature is synchronous), but `NapiNode.send` returns a Promise. We
   * dispatch it and log any rejection — errors here are mesh-layer issues
   * (peer gone, socket dead) and the consumer recovers via the `'disconnected'`
   * event, not by awaiting the send.
   */
  private sendWire(message: PTYWireMessage): void {
    if (!this.isReady) {
      console.warn(`${LOG_PREFIX} [${this._peerId}] send dropped — transport not ready (type=${message.type})`);
      return;
    }
    const buffer = Buffer.from(JSON.stringify(message));
    void this._node.send(this._peerId, PTY_NAMESPACE, buffer).catch((err) => {
      console.warn(
        `${LOG_PREFIX} [${this._peerId}] send failed (type=${message.type}):`,
        err instanceof Error ? err.message : err
      );
    });
  }

  // ─── Viewer → Owner ───────────────────────────────────────────────────────

  sendInput(sessionId: string, data: string | Buffer): void {
    const encoded =
      typeof data === 'string'
        ? Buffer.from(data).toString('base64')
        : data.toString('base64');
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.INPUT, sessionId, data: encoded });
  }

  sendResize(sessionId: string, cols: number, rows: number): void {
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.RESIZE, sessionId, cols, rows });
  }

  sendKill(sessionId: string, signal?: string): void {
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.KILL, sessionId, signal });
  }

  sendFocus(sessionId: string, focused: boolean): void {
    // Viewer signaling that it gained/lost focus for the remote session.
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.FOCUS_CHANGED, sessionId, focused });
  }

  // ─── Owner → Viewer (relay mode) ─────────────────────────────────────────

  /**
   * NOTE on `targetDeviceId`: the `IPTYTransport` signature allows routing
   * output to an arbitrary target, but `MeshPTYTransport` is already bound
   * to a single peer (`this._peerId`). We honor the parameter for API
   * symmetry with the interface but log a warning if it disagrees — callers
   * should look up the right transport from `PTYMeshBridge.getTransport(peerId)`
   * and send there, not re-route via an arbitrary transport.
   */
  sendOutput(sessionId: string, data: Buffer, targetDeviceId: string): void {
    this.assertTargetMatches(targetDeviceId, 'sendOutput');
    const encoded = data.toString('base64');
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.OUTPUT, sessionId, data: encoded });
  }

  sendResized(sessionId: string, cols: number, rows: number, targetDeviceId: string): void {
    this.assertTargetMatches(targetDeviceId, 'sendResized');
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.RESIZED, sessionId, cols, rows });
  }

  sendSessionEnded(sessionId: string, exitCode: number, targetDeviceId: string): void {
    this.assertTargetMatches(targetDeviceId, 'sendSessionEnded');
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.SESSION_ENDED, sessionId, exitCode });
  }

  sendFocusChanged(sessionId: string, focused: boolean, targetDeviceId: string): void {
    this.assertTargetMatches(targetDeviceId, 'sendFocusChanged');
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.FOCUS_CHANGED, sessionId, focused });
  }

  private assertTargetMatches(targetDeviceId: string, method: string): void {
    if (targetDeviceId !== this._peerId) {
      console.warn(
        `${LOG_PREFIX} [${this._peerId}] ${method} called with targetDeviceId=${targetDeviceId} — ` +
          `transport is bound to a different peer. Sending to this transport's peer anyway.`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mesh-specific helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Subscribe to a remote session to start receiving its output. */
  subscribe(sessionId: string): void {
    this.sendWire({
      type: WS_PTY_MESSAGE_TYPES.SUBSCRIBE,
      sessionId,
    } satisfies WSSubscribePayload & { type: string });
  }

  /** Unsubscribe from a remote session. */
  unsubscribe(sessionId: string): void {
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.UNSUBSCRIBE, sessionId });
  }

  /**
   * Request creation of a new session on the remote device.
   *
   * RemoteSessionService currently responds with CREATE_FAILED — remote
   * session spawning is out of scope for v0.1 (see plan D7).
   */
  createRemoteSession(options: WSCreateSessionPayload): void {
    this.sendWire({ type: WS_PTY_MESSAGE_TYPES.CREATE_SESSION, ...options });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection State Updates (driven by PTYMeshBridge)
  // ─────────────────────────────────────────────────────────────────────────

  /** Mark the transport as connected/ready. */
  handleConnected(): void {
    if (this._disposed || this._isReady) return;
    this._isReady = true;
    this.emit('connected');
  }

  /** Mark the transport as disconnected. */
  handleDisconnected(reason: string): void {
    if (!this._isReady) return;
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
