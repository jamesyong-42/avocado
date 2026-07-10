/**
 * PTYMeshBridge — wires truffle peer events to `MeshPTYTransport` instances.
 *
 * The bridge's single responsibility is transport lifecycle management:
 *
 *   - On init: create a `MeshPTYTransport` for every **online** peer and
 *     register it with `PTYSessionManager`.
 *   - On `joined` / `identity` / `updated` / `ws_connected`: ensure a
 *     transport exists for the peer (and re-index durable ULID).
 *   - On `left`: tear down the transport and clean up proxy sessions.
 *
 * RFC 022 (truffle ≥ 0.6):
 *   - Transports are keyed by `peer.ref` (process-local generation token).
 *   - **Do not gate** transport creation on `wsConnected`. Eager identity
 *     often learns a durable ULID then idle-reaps the hello WebSocket, so
 *     peers can be online + identified with `wsConnected === false`.
 *     `Peer.send` dials on demand — the envelope-bus WS is not a hard
 *     prerequisite for owning a transport.
 *   - `ws_disconnected` is a soft signal (do not dispose the transport).
 *   - Secondary index `deviceId → peerRef` supports SyncedStore reconciliation.
 *
 * Higher-level concerns (session discovery, relay sessions, focus) live in
 * `RemoteSessionService`.
 */

import { EventEmitter } from 'events';
import type { MeshNode, MeshPeerEvent, Peer } from '@vibecook/truffle';
import type { PTYSessionManager } from '#core';
import { MeshPTYTransport, createMeshPTYTransport } from './mesh-pty-transport.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[PTYMeshBridge]';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PTYMeshBridgeOptions {
  node: MeshNode;
  sessionManager: PTYSessionManager;
}

export interface PTYMeshBridgeEvents {
  /** A transport was created for a peer (`peerRef`). */
  transportCreated: (peerRef: string, transport: MeshPTYTransport) => void;
  /** A transport was removed (peer left or bridge disposing). */
  transportRemoved: (peerRef: string, reason: string) => void;
}

export interface IPTYMeshBridge extends EventEmitter {
  initialize(): Promise<void>;
  isInitialized(): boolean;
  getTransportCount(): number;
  /** Lookup by process-local peer ref (primary key). */
  getTransport(peerRef: string): MeshPTYTransport | null;
  /** Lookup by durable ULID once identity is known (SyncedStore path). */
  getTransportByDeviceId(deviceId: string): MeshPTYTransport | null;
  /** Lookup by interned Peer handle. */
  getTransportForPeer(peer: Peer): MeshPTYTransport | null;
  getTransports(): Map<string, MeshPTYTransport>;
  getConnectedPeers(): string[];
  dispose(): void;

  on<K extends keyof PTYMeshBridgeEvents>(event: K, listener: PTYMeshBridgeEvents[K]): this;
  off<K extends keyof PTYMeshBridgeEvents>(event: K, listener: PTYMeshBridgeEvents[K]): this;
  emit<K extends keyof PTYMeshBridgeEvents>(
    event: K,
    ...args: Parameters<PTYMeshBridgeEvents[K]>
  ): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class PTYMeshBridge extends EventEmitter implements IPTYMeshBridge {
  private readonly node: MeshNode;
  private readonly sessionManager: PTYSessionManager;
  /** Primary index: peer.ref → transport. */
  private readonly transports = new Map<string, MeshPTYTransport>();
  /** Secondary index: durable deviceId (ULID) → peer.ref. */
  private readonly byDeviceId = new Map<string, string>();
  /** Secondary index: tailscaleId → peer.ref (for string msg.from fallback). */
  private readonly byTailscaleId = new Map<string, string>();
  private initialized = false;

  constructor(options: PTYMeshBridgeOptions) {
    super();
    this.node = options.node;
    this.sessionManager = options.sessionManager;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log(`${LOG_PREFIX} already initialized`);
      return;
    }

    // Subscribe FIRST so we don't miss peer events between the initial
    // snapshot and the subscription. Duplicate create for an already-seen
    // peer is a no-op (createTransportForPeer short-circuits).
    this.node.onPeerChange((event: MeshPeerEvent) => {
      this.handlePeerChange(event);
    });

    // Seed transports for peers that are already online. RFC 022: do not
    // require `wsConnected` — eager identity may leave WS down after hello.
    const peers = await this.node.getPeers();
    for (const peer of peers) {
      if (peer.online) {
        this.createTransportForPeer(peer);
      }
    }

    this.initialized = true;
    console.log(
      `${LOG_PREFIX} initialized with ${this.transports.size} existing transport(s)`
    );
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  dispose(): void {
    for (const [peerRef, transport] of this.transports) {
      try {
        this.sessionManager.unregisterTransport(transport.transportId);
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} error unregistering transport ${peerRef}:`,
          err instanceof Error ? err.message : err
        );
      }
      transport.dispose();
      this.emit('transportRemoved', peerRef, 'bridge disposed');
    }
    this.transports.clear();
    this.byDeviceId.clear();
    this.byTailscaleId.clear();
    // NOTE: MeshNode.onPeerChange has no unsubscribe primitive. The bridge
    // is expected to live for the lifetime of the node.
    this.initialized = false;
    this.removeAllListeners();
    console.log(`${LOG_PREFIX} disposed`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public getters
  // ─────────────────────────────────────────────────────────────────────────

  getTransportCount(): number {
    return this.transports.size;
  }

  getTransport(peerRef: string): MeshPTYTransport | null {
    return this.transports.get(peerRef) ?? null;
  }

  getTransportByDeviceId(deviceId: string): MeshPTYTransport | null {
    const ref = this.byDeviceId.get(deviceId);
    if (!ref) return null;
    return this.transports.get(ref) ?? null;
  }

  getTransportForPeer(peer: Peer): MeshPTYTransport | null {
    return this.transports.get(peer.ref) ?? null;
  }

  getTransports(): Map<string, MeshPTYTransport> {
    return new Map(this.transports);
  }

  getConnectedPeers(): string[] {
    return Array.from(this.transports.keys());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Peer change handling
  // ─────────────────────────────────────────────────────────────────────────

  private handlePeerChange(event: MeshPeerEvent): void {
    // MeshPeerEvent uses `type` (createMeshNode wrapper).
    switch (event.type) {
      case 'joined':
      case 'identity':
      case 'updated':
      case 'ws_connected': {
        if (!event.peer) {
          // `updated` without a snapshot can still carry peerId — ignore.
          if (event.type === 'ws_connected') {
            console.warn(
              `${LOG_PREFIX} ${event.type} without interned peer (peerId=${event.peerId})`
            );
          }
          return;
        }
        if (event.peer.online || event.type === 'ws_connected') {
          this.createTransportForPeer(event.peer);
        } else {
          // Offline update: still refresh indexes if we already have a transport.
          this.indexPeer(event.peer);
        }
        return;
      }

      case 'ws_disconnected': {
        // Soft signal only. Eager-identity hello WS often drops after ULID
        // exchange; disposing here would tear down relays/proxies for an
        // online peer. Peer.send re-dials on demand.
        const transport = this.resolveTransport(event);
        if (transport && event.peer) {
          this.indexPeer(event.peer);
        }
        return;
      }

      case 'left': {
        const transport = this.resolveTransport(event);
        if (transport) {
          this.removeTransportForPeer(transport.peerId, 'left');
        }
        return;
      }

      case 'auth_required':
      default:
        return;
    }
  }

  private resolveTransport(event: MeshPeerEvent): MeshPTYTransport | null {
    if (event.peer) {
      return this.transports.get(event.peer.ref) ?? null;
    }
    if (event.peerId) {
      const byTs = this.byTailscaleId.get(event.peerId);
      if (byTs) return this.transports.get(byTs) ?? null;
      return this.transports.get(event.peerId) ?? null;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Transport bookkeeping
  // ─────────────────────────────────────────────────────────────────────────

  private indexPeer(peer: Peer): void {
    this.byTailscaleId.set(peer.tailscaleId, peer.ref);
    if (peer.deviceId) {
      this.byDeviceId.set(peer.deviceId, peer.ref);
    }
  }

  private unindexPeer(transport: MeshPTYTransport): void {
    const peer = transport.peer;
    if (this.byTailscaleId.get(peer.tailscaleId) === peer.ref) {
      this.byTailscaleId.delete(peer.tailscaleId);
    }
    if (peer.deviceId && this.byDeviceId.get(peer.deviceId) === peer.ref) {
      this.byDeviceId.delete(peer.deviceId);
    }
  }

  private createTransportForPeer(peer: Peer): void {
    const existing = this.transports.get(peer.ref);
    if (existing) {
      // Already have a transport — refresh indexes (identity may have landed)
      // and ensure ready for send.
      this.indexPeer(peer);
      existing.handleConnected();
      return;
    }

    const transport = createMeshPTYTransport({
      node: this.node,
      peer,
      // Ready immediately: Peer.send dials the envelope bus as needed.
      isConnected: true,
    });
    this.transports.set(peer.ref, transport);
    this.indexPeer(peer);
    this.sessionManager.registerTransport(transport);

    console.log(
      `${LOG_PREFIX} created transport for peer ${peer.ref} (${peer.displayName}` +
        `${peer.deviceId ? `, deviceId=${peer.deviceId}` : ', identity pending'}` +
        `, ws=${peer.wsConnected})`
    );
    this.emit('transportCreated', peer.ref, transport);
  }

  private removeTransportForPeer(peerRef: string, reason: string): void {
    const transport = this.transports.get(peerRef);
    if (!transport) return;

    transport.handleDisconnected(reason);
    this.sessionManager.unregisterTransport(transport.transportId);
    this.unindexPeer(transport);
    transport.dispose();
    this.transports.delete(peerRef);

    console.log(`${LOG_PREFIX} removed transport for peer ${peerRef} (${reason})`);
    this.emit('transportRemoved', peerRef, reason);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createPTYMeshBridge(options: PTYMeshBridgeOptions): PTYMeshBridge {
  return new PTYMeshBridge(options);
}
