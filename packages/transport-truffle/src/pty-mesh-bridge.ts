/**
 * PTYMeshBridge — wires truffle peer events to `MeshPTYTransport` instances.
 *
 * The bridge's single responsibility is transport lifecycle management:
 *
 *   - On init: create a `MeshPTYTransport` for every peer already
 *     WebSocket-connected, and register it with `PTYSessionManager`.
 *   - On `ws_connected`: create a new transport for the peer.
 *   - On `ws_disconnected`: tear down the transport, unregister from the
 *     session manager, and clean up any proxy sessions associated with it.
 *
 * Higher-level concerns (session discovery, relay sessions, focus) live in
 * `RemoteSessionService`. The bridge intentionally knows nothing about the
 * PTY wire protocol beyond delegating to `MeshPTYTransport`.
 *
 * Ported from vibe-ctl's
 *   packages/desktop/src/main/services/foundation/pty/bridges/pty-mesh-bridge.ts
 * and rewired to talk to `NapiNode.onPeerChange` directly instead of the
 * vibe-ctl `WSService`/`MeshService` abstraction.
 */

import { EventEmitter } from 'events';
import type { NapiNode, NapiPeer, NapiPeerEvent } from '@vibecook/truffle';
import type { PTYSessionManager } from '@avocado/core';
import { MeshPTYTransport, createMeshPTYTransport } from './mesh-pty-transport.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[PTYMeshBridge]';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PTYMeshBridgeOptions {
  node: NapiNode;
  sessionManager: PTYSessionManager;
}

export interface PTYMeshBridgeEvents {
  /** A transport was created for a peer. */
  transportCreated: (peerId: string, transport: MeshPTYTransport) => void;
  /** A transport was removed (peer disconnected or bridge disposing). */
  transportRemoved: (peerId: string, reason: string) => void;
}

export interface IPTYMeshBridge extends EventEmitter {
  initialize(): Promise<void>;
  isInitialized(): boolean;
  getTransportCount(): number;
  getTransport(peerId: string): MeshPTYTransport | null;
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
  private readonly node: NapiNode;
  private readonly sessionManager: PTYSessionManager;
  private readonly transports = new Map<string, MeshPTYTransport>();
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

    // Subscribe FIRST so we don't miss any peer events between the initial
    // snapshot and the subscription. A duplicate `ws_connected` for an
    // already-seen peer is a no-op (createTransportForPeer short-circuits).
    this.node.onPeerChange((event: NapiPeerEvent) => {
      this.handlePeerChange(event);
    });

    // Seed transports for peers that are already connected.
    const peers = await this.node.getPeers();
    for (const peer of peers) {
      if (peer.wsConnected) {
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
    for (const [peerId, transport] of this.transports) {
      // Notify listeners then unregister from the session manager so proxy
      // sessions clean up before we destroy the transport.
      try {
        this.sessionManager.unregisterTransport(transport.transportId);
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} error unregistering transport ${peerId}:`,
          err instanceof Error ? err.message : err
        );
      }
      transport.dispose();
      this.emit('transportRemoved', peerId, 'bridge disposed');
    }
    this.transports.clear();
    // NOTE: NapiNode.onPeerChange has no unsubscribe primitive in v0.3.24.
    // The bridge is expected to live for the lifetime of the node; if the
    // consumer needs fine-grained teardown they should stop the node.
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

  getTransport(peerId: string): MeshPTYTransport | null {
    return this.transports.get(peerId) ?? null;
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

  private handlePeerChange(event: NapiPeerEvent): void {
    switch (event.eventType) {
      case 'ws_connected': {
        // `peer` may or may not be present on ws_connected events in
        // truffle 0.4.x — handle both shapes. If missing, fall back to a
        // deviceId-only record using the event's `peerId` field (which
        // RFC 017 redefined to carry the stable device ULID, even though
        // the field name on `NapiPeerEvent` is still `peerId`).
        const peer: NapiPeer | undefined =
          event.peer ??
          (event.peerId
            ? {
                deviceId: event.peerId,
                deviceName: event.peerId,
                ip: '',
                online: true,
                wsConnected: true,
                connectionType: 'unknown',
                tailscaleId: '',
              }
            : undefined);
        if (!peer) {
          console.warn(`${LOG_PREFIX} ws_connected without peerId`);
          return;
        }
        this.createTransportForPeer(peer);
        return;
      }

      case 'ws_disconnected': {
        if (!event.peerId) return;
        this.removeTransportForPeer(event.peerId, 'ws_disconnected');
        return;
      }

      // Other event types are handled elsewhere:
      //   - `joined` / `left` / `updated` are Tailscale layer-3 events;
      //     the transport cares about WebSocket status only.
      //   - `auth_required` is handled by the consumer's createMeshNode
      //     callback.
      case 'joined':
      case 'left':
      case 'updated':
      case 'auth_required':
      default:
        return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Transport bookkeeping
  // ─────────────────────────────────────────────────────────────────────────

  private createTransportForPeer(peer: NapiPeer): void {
    // RFC 017 (truffle 0.4.0): peers are keyed by `deviceId` (stable ULID)
    // and named via `deviceName`. The `peerId` parameter on
    // `createMeshPTYTransport` still uses the legacy "peerId" name
    // internally — that's intentional shadowing of `IPTYTransport.transportId`
    // semantics; the value we pass is the new `deviceId`.
    const existing = this.transports.get(peer.deviceId);
    if (existing) {
      // If we already have a transport for this peer, just make sure it's
      // marked ready (reconnect after a blip).
      existing.handleConnected();
      return;
    }

    const transport = createMeshPTYTransport({
      node: this.node,
      peerId: peer.deviceId,
      peerName: peer.deviceName,
      isConnected: true,
    });
    this.transports.set(peer.deviceId, transport);
    this.sessionManager.registerTransport(transport);

    console.log(`${LOG_PREFIX} created transport for peer ${peer.deviceId} (${peer.deviceName})`);
    this.emit('transportCreated', peer.deviceId, transport);
  }

  private removeTransportForPeer(peerId: string, reason: string): void {
    const transport = this.transports.get(peerId);
    if (!transport) return;

    // Order matters: mark the transport disconnected FIRST so listeners
    // on the transport can react to the `'disconnected'` event before we
    // unregister it from the session manager (which in turn disposes
    // proxy sessions for this transport).
    transport.handleDisconnected(reason);
    this.sessionManager.unregisterTransport(transport.transportId);
    transport.dispose();
    this.transports.delete(peerId);

    console.log(`${LOG_PREFIX} removed transport for peer ${peerId} (${reason})`);
    this.emit('transportRemoved', peerId, reason);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createPTYMeshBridge(options: PTYMeshBridgeOptions): PTYMeshBridge {
  return new PTYMeshBridge(options);
}
