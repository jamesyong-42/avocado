/**
 * RemoteSessionService — orchestrates cross-device session sharing.
 *
 * Composes the low-level pieces in this package into a single service:
 *
 *   - `PTYMeshBridge`     — creates one `MeshPTYTransport` per connected peer
 *   - `PTYSyncStore`      — publishes our local sessions + observes remote slices
 *   - `RelaySessionManager` — per-subscriber owner-side forwarders
 *
 * And subscribes to the `'pty'` truffle namespace to handle owner-side
 * commands from remote viewers (SUBSCRIBE / UNSUBSCRIBE / INPUT / RESIZE /
 * KILL / FOCUS_CHANGED). Consumers drop in a `PTYSessionManager` that owns
 * local sessions and (optionally) an `IPeerNotifier` for surfacing focus
 * changes to a renderer.
 *
 * RFC 022 (truffle ≥ 0.6):
 *   - Inbound `msg.from` is a Peer handle (or Tailscale id string fallback).
 *   - Live PTY routing keys on `peer.ref` via the bridge.
 *   - SyncedStore discovery keys on durable ULID; the bridge secondary index
 *     maps deviceId → transport once identity is known.
 */

import { EventEmitter } from 'events';
import type {
  MeshNode,
  MeshNamespacedMessage,
  Peer,
} from '@vibecook/truffle';
import type { PTYSessionManager } from '#core';
import type { ITerminalStoreSync } from '#core';
import type {
  IPTYTransport,
  RemoteSessionAnnounce,
  WSInputPayload,
  WSResizePayload,
  WSSubscribePayload,
} from '#types';
import { WS_PTY_MESSAGE_TYPES, getOriginalId } from '#types';

import { PTY_NAMESPACE } from './mesh-pty-transport.js';
import type { MeshPTYTransport } from './mesh-pty-transport.js';
import type { PTYMeshBridge } from './pty-mesh-bridge.js';
import type { PTYSyncStore } from './pty-sync-store.js';
import {
  createRelaySessionManager,
  type IRelaySessionManager,
} from './relay-session-manager.js';

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Side-channel for surfacing UI-relevant state changes to the consumer
 * application. Replaces vibe-ctl's direct `BrowserWindow.webContents.send()`
 * calls — Electron apps wire this to forward events to the renderer,
 * headless apps can omit it.
 */
export interface IPeerNotifier {
  /** A session's focus state changed (local input or remote viewer). */
  sessionFocusChanged(
    sessionId: string,
    focused: boolean,
    source: 'local' | 'remote',
    /** Peer ref, deviceId, or other stable label for the remote device. */
    deviceId?: string
  ): void;
  /**
   * The set of sessions a peer is sharing changed.
   * `deviceId` is the durable ULID from SyncedStore when known.
   */
  remoteSessionsChanged(deviceId: string, count: number): void;
}

export interface RemoteSessionServiceOptions {
  node: MeshNode;
  sessionManager: PTYSessionManager;
  bridge: PTYMeshBridge;
  syncStore: PTYSyncStore;
  /** Optional: terminal authority store used to gate resize requests. */
  terminalStoreSync?: ITerminalStoreSync;
  /** Optional: side channel for UI notifications (Electron, etc). */
  notifier?: IPeerNotifier;
}

export interface RemoteSessionServiceEvents {
  enabled: () => void;
  disabled: () => void;
  /** Fired with process-local peer ref when a transport is created. */
  deviceConnected: (peerRef: string) => void;
  deviceDisconnected: (peerRef: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[RemoteSessionService]';

/** Minimal shape every inbound PTY payload has — discriminator field. */
interface PTYWirePayload {
  type: string;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class RemoteSessionService extends EventEmitter {
  private readonly node: MeshNode;
  private readonly sessionManager: PTYSessionManager;
  private readonly bridge: PTYMeshBridge;
  private readonly syncStore: PTYSyncStore;
  private readonly terminalStoreSync?: ITerminalStoreSync;
  private readonly notifier?: IPeerNotifier;

  private relayManager: IRelaySessionManager;
  private enabled = false;

  // Listener references we install on external emitters. Held so we can
  // detach them on `disable()`.
  private readonly sessionDiscoveredHandler: () => void;
  private readonly sessionLostHandler: () => void;
  private readonly bridgeTransportCreatedHandler: (peerRef: string) => void;
  private readonly bridgeTransportRemovedHandler: (peerRef: string) => void;

  constructor(options: RemoteSessionServiceOptions) {
    super();
    this.node = options.node;
    this.sessionManager = options.sessionManager;
    this.bridge = options.bridge;
    this.syncStore = options.syncStore;
    this.terminalStoreSync = options.terminalStoreSync;
    this.notifier = options.notifier;
    this.relayManager = createRelaySessionManager(this.terminalStoreSync);

    // Republish local sessions whenever our session set changes.
    this.sessionDiscoveredHandler = (): void => {
      void this.publishLocalSessions();
    };
    this.sessionLostHandler = (): void => {
      void this.publishLocalSessions();
    };

    // Mirror bridge connect/disconnect as RemoteSessionService events and
    // clean up any relays when a peer vanishes.
    this.bridgeTransportCreatedHandler = (peerRef: string): void => {
      this.emit('deviceConnected', peerRef);
      // If the peer already has a published slice in the sync store,
      // reconcile their sessions immediately. Store is keyed by ULID.
      const transport = this.bridge.getTransport(peerRef);
      const deviceId = transport?.deviceId;
      if (!deviceId) {
        // Identity pending — store reconciliation will run when the peer's
        // slice arrives (or after identity + transportCreated races settle).
        return;
      }
      void this.syncStore.getRemoteSessions().then((map) => {
        const sessions = map.get(deviceId);
        if (sessions) {
          this.handleRemoteSessionsChanged(deviceId, sessions);
        }
      });
    };
    this.bridgeTransportRemovedHandler = (peerRef: string): void => {
      this.relayManager.cleanupForDevice(peerRef);
      this.emit('deviceDisconnected', peerRef);
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  isEnabled(): boolean {
    return this.enabled;
  }

  getRelayManager(): IRelaySessionManager {
    return this.relayManager;
  }

  /**
   * Start processing cross-device sharing.
   *
   * Assumes `bridge.initialize()` has already been called by the caller.
   * If not, transports for currently connected peers won't exist yet —
   * subsequent connections will still work via the bridge's peer-change
   * handler.
   */
  async enable(): Promise<void> {
    if (this.enabled) {
      console.log(`${LOG_PREFIX} already enabled`);
      return;
    }

    // 1. Subscribe to the 'pty' namespace for owner-side messages.
    this.node.onMessage(PTY_NAMESPACE, (msg: MeshNamespacedMessage) => {
      if (!this.enabled) return;
      this.handleIncomingPtyMessage(msg);
    });

    // 2. Listen for remote session slice changes and reconcile proxies.
    //    Callback `deviceId` is the durable ULID from SyncedStore.
    this.syncStore.onRemoteChange((deviceId, sessions) => {
      if (!this.enabled) return;
      this.handleRemoteSessionsChanged(deviceId, sessions);
    });

    // 3. Listen for local session discovery/loss so we can republish.
    this.sessionManager.on('sessionDiscovered', this.sessionDiscoveredHandler);
    this.sessionManager.on('sessionLost', this.sessionLostHandler);

    // 4. Bridge transport lifecycle → our own events + relay cleanup.
    this.bridge.on('transportCreated', this.bridgeTransportCreatedHandler);
    this.bridge.on('transportRemoved', this.bridgeTransportRemovedHandler);

    // 5. Seed the sync store with our current local sessions.
    await this.publishLocalSessions();

    this.enabled = true;
    console.log(`${LOG_PREFIX} enabled`);
    this.emit('enabled');
  }

  async disable(): Promise<void> {
    if (!this.enabled) return;
    this.enabled = false;

    this.sessionManager.off('sessionDiscovered', this.sessionDiscoveredHandler);
    this.sessionManager.off('sessionLost', this.sessionLostHandler);
    this.bridge.off('transportCreated', this.bridgeTransportCreatedHandler);
    this.bridge.off('transportRemoved', this.bridgeTransportRemovedHandler);

    this.relayManager.dispose();
    // Rebuild a fresh relay manager so a subsequent `enable()` starts clean.
    this.relayManager = createRelaySessionManager(this.terminalStoreSync);

    // Publish an empty session list so peers see we've gone dark.
    try {
      await this.syncStore.setLocalSessions([]);
    } catch {
      // Store may already be disposed — ignore.
    }

    // NOTE: we don't unsubscribe from `node.onMessage` or
    // `syncStore.onRemoteChange` because truffle doesn't expose an
    // unsubscribe primitive. The `this.enabled` guard short-circuits
    // dispatch until the next `enable()`.

    console.log(`${LOG_PREFIX} disabled`);
    this.emit('disabled');
  }

  async dispose(): Promise<void> {
    await this.disable();
    this.removeAllListeners();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Local session publishing
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Publish the current set of shareable local sessions to the sync store.
   *
   * Only `local` and `ipc` sessions are published — `ws` sessions are
   * already-proxied remote sessions; re-publishing them would create a
   * re-sharing loop. Cooperative "last write wins" (no authority check).
   */
  private async publishLocalSessions(): Promise<void> {
    const sessions = this.sessionManager
      .getSessions()
      .filter((s) => s.source === 'local' || s.source === 'ipc')
      .map<RemoteSessionAnnounce>((s) => ({
        sessionId: s.id,
        pid: s.pid,
        command: s.command,
        cwd: s.cwd,
        cols: s.cols,
        rows: s.rows,
      }));

    try {
      await this.syncStore.setLocalSessions(sessions);
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} failed to publish local sessions:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Incoming PTY messages (owner-side handlers)
  // ─────────────────────────────────────────────────────────────────────────

  private handleIncomingPtyMessage(msg: MeshNamespacedMessage): void {
    const from = msg.from;
    if (!from) {
      console.warn(`${LOG_PREFIX} pty message from unknown peer`);
      return;
    }

    const transport = this.resolveTransportFromMessage(from);
    if (!transport) {
      // Viewer-side messages (OUTPUT, etc.) land here too but belong to a
      // MeshPTYTransport subscription — or the peer has no transport yet.
      // Only owner-side types need a transport; unknown senders are ignored
      // after type check below.
    }

    const payload = msg.payload as PTYWirePayload | null | undefined;
    if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') {
      return;
    }

    // Viewer keys for relay bookkeeping: prefer peer.ref for generation
    // safety; fall back to the raw string (Tailscale id).
    const viewerKey = transport?.peerId ?? this.fromKey(from);

    switch (payload.type) {
      case WS_PTY_MESSAGE_TYPES.SUBSCRIBE: {
        this.handleSubscribe(viewerKey, transport, payload as unknown as WSSubscribePayload);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.UNSUBSCRIBE: {
        const p = payload as unknown as { sessionId: string };
        this.handleUnsubscribe(viewerKey, p);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.INPUT: {
        this.handleInput(payload as unknown as WSInputPayload);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.RESIZE: {
        this.handleResize(from, payload as unknown as WSResizePayload);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.KILL: {
        const p = payload as unknown as { sessionId: string; signal?: string };
        this.handleKill(p);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.FOCUS_CHANGED: {
        const p = payload as unknown as { sessionId: string; focused: boolean };
        this.handleFocusFromViewer(viewerKey, p);
        return;
      }
      case WS_PTY_MESSAGE_TYPES.CREATE_SESSION: {
        // v0.1: remote spawn is out of scope (plan D7). Fail fast so the
        // viewer doesn't hang waiting for a session.
        this.replyCreateFailed(from, transport, 'remote spawn not supported in v0.1');
        return;
      }
      // All other types are viewer-side (OUTPUT, RESIZED, SESSION_ENDED,
      // SESSION_CREATED, CREATE_FAILED). They are handled by the relevant
      // `MeshPTYTransport`'s own subscription — nothing to do here.
      default:
        return;
    }
  }

  private fromKey(from: MeshNamespacedMessage['from']): string {
    if (typeof from === 'string') return from;
    return from.ref;
  }

  private resolveTransportFromMessage(
    from: MeshNamespacedMessage['from']
  ): MeshPTYTransport | null {
    if (typeof from !== 'string') {
      return this.bridge.getTransportForPeer(from);
    }
    // String form is WhoIs Tailscale id (or rarely a peer ref).
    return (
      this.bridge.getTransport(from) ??
      // Tailscale-indexed path
      this.findTransportByTailscale(from)
    );
  }

  private findTransportByTailscale(tailscaleId: string): MeshPTYTransport | null {
    for (const transport of this.bridge.getTransports().values()) {
      if (transport.peer.tailscaleId === tailscaleId) return transport;
    }
    return null;
  }

  // ─── SUBSCRIBE ────────────────────────────────────────────────────────────

  private handleSubscribe(
    viewerKey: string,
    transport: MeshPTYTransport | null,
    payload: WSSubscribePayload
  ): void {
    const { sessionId } = payload;
    const session = this.sessionManager.getSession(sessionId);

    // We only share sessions whose origin is on this device. Re-sharing a
    // `ws` session would cause a routing loop.
    if (!session || session.source === 'ws') {
      console.warn(
        `${LOG_PREFIX} subscribe rejected — session ${sessionId} not shareable`
      );
      return;
    }

    if (!transport) {
      console.warn(`${LOG_PREFIX} subscribe rejected — no transport for peer ${viewerKey}`);
      return;
    }

    // Create (or reuse) a relay session for this (session, peer) pair.
    this.relayManager.createRelay(session, transport, viewerKey);

    // Replay the current output buffer to the new subscriber so they see
    // accumulated terminal state, not just new output.
    const buffer = this.sessionManager.getOutputBuffer(sessionId);
    if (buffer && buffer.length > 0) {
      transport.sendOutput(sessionId, buffer, viewerKey);
    }

    console.log(`${LOG_PREFIX} peer ${viewerKey} subscribed to ${sessionId}`);
  }

  private handleUnsubscribe(viewerKey: string, payload: { sessionId: string }): void {
    this.relayManager.disposeRelay(payload.sessionId, viewerKey);
    console.log(`${LOG_PREFIX} peer ${viewerKey} unsubscribed from ${payload.sessionId}`);
  }

  // ─── INPUT ────────────────────────────────────────────────────────────────

  private handleInput(payload: WSInputPayload): void {
    // Input is always accepted — the canonical session decides whether to
    // act on it. (Focus authority is a UI concern, not an input gate.)
    const data = Buffer.from(payload.data, 'base64');
    this.sessionManager.write(payload.sessionId, data);
  }

  // ─── RESIZE ───────────────────────────────────────────────────────────────

  private handleResize(
    from: MeshNamespacedMessage['from'],
    payload: WSResizePayload
  ): void {
    // Authority check (optional): if a terminal store sync is wired up,
    // only let the device with an active terminal resize. Prefer durable
    // ULID when known; otherwise peer ref (best-effort).
    const authorityId =
      typeof from === 'string'
        ? from
        : (from.deviceId ?? from.ref);

    if (
      this.terminalStoreSync &&
      !this.terminalStoreSync.canDeviceResizeSession(payload.sessionId, authorityId)
    ) {
      console.warn(
        `${LOG_PREFIX} resize rejected — ${authorityId} has no active terminal for ${payload.sessionId}`
      );
      return;
    }
    this.sessionManager.resize(payload.sessionId, payload.cols, payload.rows);
  }

  // ─── KILL ─────────────────────────────────────────────────────────────────

  private handleKill(payload: { sessionId: string; signal?: string }): void {
    this.sessionManager.kill(payload.sessionId, payload.signal);
  }

  // ─── FOCUS ────────────────────────────────────────────────────────────────

  private handleFocusFromViewer(
    viewerKey: string,
    payload: { sessionId: string; focused: boolean }
  ): void {
    // Surface to the consumer via the notifier. No BrowserWindow coupling.
    this.notifier?.sessionFocusChanged(
      payload.sessionId,
      payload.focused,
      'remote',
      viewerKey
    );
  }

  // ─── CREATE (out of scope) ────────────────────────────────────────────────

  private replyCreateFailed(
    from: MeshNamespacedMessage['from'],
    transport: MeshPTYTransport | null,
    error: string
  ): void {
    const buffer = Buffer.from(
      JSON.stringify({
        type: WS_PTY_MESSAGE_TYPES.CREATE_FAILED,
        error,
      })
    );

    if (transport) {
      // Prefer the bound Peer handle for generation-checked send.
      void transport.peer.send(PTY_NAMESPACE, buffer).catch((err) => {
        console.warn(
          `${LOG_PREFIX} failed to send CREATE_FAILED:`,
          err instanceof Error ? err.message : err
        );
      });
      return;
    }

    // Last resort: PeerLike send via node (from may be Peer or query string).
    void this.node.send(from as Peer | string, PTY_NAMESPACE, buffer).catch((err) => {
      console.warn(
        `${LOG_PREFIX} failed to send CREATE_FAILED:`,
        err instanceof Error ? err.message : err
      );
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Remote session reconciliation (viewer side)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reconcile our proxy sessions against a peer's latest session list.
   *
   * Called in two places:
   *   1. `syncStore.onRemoteChange` fires when a peer updates/removes
   *      their slice (keyed by durable ULID).
   *   2. `bridge.transportCreated` fires when a peer WS-connects — we
   *      catch up on whatever they've already published (if identity known).
   *
   * @param deviceId  durable ULID of the remote device
   * @param sessions  new session list, or `null` for a peer_removed event
   */
  private handleRemoteSessionsChanged(
    deviceId: string,
    sessions: RemoteSessionAnnounce[] | null
  ): void {
    if (sessions === null) {
      this.cleanupPeerProxiesByDeviceId(deviceId);
      this.notifier?.remoteSessionsChanged(deviceId, 0);
      return;
    }

    const transport = this.bridge.getTransportByDeviceId(deviceId);
    if (!transport) {
      // No transport yet — bridge's transportCreated handler will call us
      // again once one is established (and identity is known). Or identity
      // is still pending; we'll reconcile when the index is populated.
      this.notifier?.remoteSessionsChanged(deviceId, sessions.length);
      return;
    }

    // Existing proxies for this peer, keyed by remote session id. We
    // identify per-transport proxies by filtering on
    // `getTransportIdForSession(proxy.id) === transport.transportId`.
    const existingProxies = this.sessionManager
      .getSessionsBySource('ws')
      .filter((s) => this.sessionManager.getTransportIdForSession(s.id) === transport.transportId);

    const existingRemoteIds = new Set<string>();
    for (const proxy of existingProxies) {
      // Avocado's namespaced-id helper — `getOriginalId` returns the
      // remote (non-namespaced) session id embedded in the proxy id.
      existingRemoteIds.add(getOriginalId(proxy.id));
    }

    const nextRemoteIds = new Set(sessions.map((s) => s.sessionId));

    // CREATE: emit `sessionAnnounced` on the transport for any session we
    // don't yet have a proxy for. `PTYSessionManager` listens on the
    // transport and will invoke its ProxySessionFactory to create and
    // register the proxy.
    for (const session of sessions) {
      if (!existingRemoteIds.has(session.sessionId)) {
        console.log(
          `${LOG_PREFIX} announcing remote session ${session.sessionId} from device ${deviceId}`
        );
        (transport as IPTYTransport).emit('sessionAnnounced', session);
      }
    }

    // REMOVE: kill proxies that no longer exist on the peer.
    for (const proxy of existingProxies) {
      const remoteId = getOriginalId(proxy.id);
      if (!nextRemoteIds.has(remoteId)) {
        console.log(
          `${LOG_PREFIX} remote session ${remoteId} gone from device ${deviceId}, killing proxy ${proxy.id}`
        );
        // Use `kill` rather than `dispose` — the proxy may have cleanup
        // logic registered with the session manager via its 'exit' event.
        this.sessionManager.kill(proxy.id);
      }
    }

    this.notifier?.remoteSessionsChanged(deviceId, sessions.length);
  }

  private cleanupPeerProxiesByDeviceId(deviceId: string): void {
    const transport = this.bridge.getTransportByDeviceId(deviceId);
    if (!transport) return;
    const proxies = this.sessionManager
      .getSessionsBySource('ws')
      .filter((s) => this.sessionManager.getTransportIdForSession(s.id) === transport.transportId);
    for (const proxy of proxies) {
      console.log(
        `${LOG_PREFIX} disposing proxy ${proxy.id} from departed device ${deviceId}`
      );
      proxy.dispose();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createRemoteSessionService(
  options: RemoteSessionServiceOptions
): RemoteSessionService {
  return new RemoteSessionService(options);
}
