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
 * RFC 022 (truffle ≥ 0.6): the transport holds an interned `Peer` handle.
 * Outbound traffic uses `peer.send(...)` (generation-checked routing).
 * Inbound messages are filtered by matching `msg.from` against the same
 * peer (WhoIs-verified Tailscale attribution, not a self-declared ULID).
 *
 * Ported from vibe-ctl and rewritten for `@vibecook/truffle`'s MeshNode API.
 */

import { EventEmitter } from 'events';
import type {
  MeshNode,
  MeshNamespacedMessage,
  Peer,
} from '@vibecook/truffle';
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
  /** Truffle mesh node (from `createMeshNode`). */
  node: MeshNode;
  /**
   * Interned Peer handle this transport targets (RFC 022).
   * Routing and message filtering use the handle — never a bare deviceId.
   */
  peer: Peer;
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
  private readonly _node: MeshNode;
  private readonly _peer: Peer;
  private _isReady: boolean;
  private _disposed: boolean = false;
  private _messageHandler: (msg: MeshNamespacedMessage) => void;

  constructor(options: MeshPTYTransportOptions) {
    super();
    this._node = options.node;
    this._peer = options.peer;
    this._isReady = options.isConnected ?? true;

    // Install a single namespace listener at construction time. Truffle's
    // `onMessage` is global per namespace — the callback fires for every
    // message on 'pty' regardless of sender — so we filter by matching
    // `msg.from` against our Peer handle.
    //
    // Note: `onMessage` returns void; there is no explicit unsubscribe.
    // We guard against post-dispose dispatch with the `_disposed` flag.
    this._messageHandler = (msg: MeshNamespacedMessage): void => {
      if (this._disposed) return;
      if (!this.matchesFrom(msg.from)) return;
      this.handleIncoming(msg);
    };
    this._node.onMessage(PTY_NAMESPACE, this._messageHandler);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process-local peer ref (`{tailscaleId}:{generation}`). Used as the
   * transport id so `PTYSessionManager` can look us up by peer.
   */
  get transportId(): string {
    return this._peer.ref;
  }

  get transportType(): TransportType {
    return 'ws';
  }

  /** Interned Peer handle this transport is bound to. */
  get peer(): Peer {
    return this._peer;
  }

  /**
   * Stable routing key for this transport (`peer.ref`). Prefer the `peer`
   * handle for networking; this string is for maps / IPC.
   */
  get peerId(): string {
    return this._peer.ref;
  }

  /** Human-readable name for logs and the UI. */
  get peerName(): string {
    return this._peer.displayName;
  }

  /** Durable ULID once known; null until identity hello (RFC 022). */
  get deviceId(): string | null {
    return this._peer.deviceId;
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
   * Whether an inbound `msg.from` belongs to this transport's peer.
   *
   * With `createMeshNode`, `from` is usually an interned `Peer` (same
   * instance as `getPeers()`). Fallback string form is the WhoIs-verified
   * Tailscale id.
   */
  private matchesFrom(from: MeshNamespacedMessage['from']): boolean {
    if (typeof from === 'string') {
      return from === this._peer.tailscaleId || from === this._peer.ref;
    }
    return from.ref === this._peer.ref || from.tailscaleId === this._peer.tailscaleId;
  }

  /**
   * Dispatch a message already filtered to this peer.
   *
   * `msg.payload` is a JSON object truffle decoded on the receive side
   * (not a Buffer) — calling `JSON.parse` on it throws. We cast through
   * `PTYWireMessage` and pick out the `type` discriminator.
   */
  private handleIncoming(msg: MeshNamespacedMessage): void {
    const payload = msg.payload as PTYWireMessage | null | undefined;
    if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') {
      console.warn(`${LOG_PREFIX} [${this.peerId}] dropped malformed payload`);
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
   * signature is synchronous), but Peer.send returns a Promise. We dispatch
   * it and log any rejection — errors here are mesh-layer issues (peer gone,
   * socket dead) and the consumer recovers via the `'disconnected'` event.
   */
  private sendWire(message: PTYWireMessage): void {
    if (!this.isReady) {
      console.warn(
        `${LOG_PREFIX} [${this.peerId}] send dropped — transport not ready (type=${message.type})`
      );
      return;
    }
    const buffer = Buffer.from(JSON.stringify(message));
    // Prefer the Peer handle (generation-checked route). MeshNode.send also
    // accepts PeerLike if we ever need the node path.
    void this._peer.send(PTY_NAMESPACE, buffer).catch((err) => {
      console.warn(
        `${LOG_PREFIX} [${this.peerId}] send failed (type=${message.type}):`,
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
   * to a single peer (`this._peer`). We honor the parameter for API
   * symmetry with the interface but log a warning if it disagrees — callers
   * should look up the right transport from `PTYMeshBridge` and send there.
   *
   * The historical name "targetDeviceId" now means any peer key we use
   * (typically `peer.ref`, sometimes a durable ULID).
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

  private assertTargetMatches(targetKey: string, method: string): void {
    const matches =
      targetKey === this._peer.ref ||
      targetKey === this._peer.tailscaleId ||
      (this._peer.deviceId !== null && targetKey === this._peer.deviceId);
    if (!matches) {
      console.warn(
        `${LOG_PREFIX} [${this.peerId}] ${method} called with target=${targetKey} — ` +
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
