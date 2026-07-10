/**
 * Lightweight MeshNode / Peer mocks for transport-truffle unit tests.
 *
 * Real Peer instances have a private constructor; tests use structural
 * doubles that satisfy the methods MeshPTYTransport / PTYMeshBridge call.
 */

import { EventEmitter } from 'node:events';
import type { MeshPeerEvent, MeshNamespacedMessage } from '@vibecook/truffle';

export type MockPeer = {
  ref: string;
  displayName: string;
  deviceId: string | null;
  deviceName: string | null;
  tailscaleId: string;
  hostname: string;
  ip: string;
  online: boolean;
  wsConnected: boolean;
  connectionType: string;
  generation: number;
  os?: string | null;
  lastSeen?: string | null;
  send: (namespace: string, data: Buffer | Uint8Array) => Promise<void>;
  ping: () => Promise<{ latencyMs: number; connection: string }>;
  equals: (other: MockPeer) => boolean;
};

export function createMockPeer(partial: Partial<MockPeer> & Pick<MockPeer, 'ref' | 'tailscaleId'>): MockPeer {
  const peer: MockPeer = {
    displayName: partial.displayName ?? partial.tailscaleId.slice(0, 8),
    deviceId: partial.deviceId ?? null,
    deviceName: partial.deviceName ?? null,
    hostname: partial.hostname ?? 'host',
    ip: partial.ip ?? '100.64.0.1',
    online: partial.online ?? true,
    wsConnected: partial.wsConnected ?? false,
    connectionType: partial.connectionType ?? 'direct',
    generation: partial.generation ?? 1,
    os: partial.os ?? null,
    lastSeen: partial.lastSeen ?? null,
    send: partial.send ?? (async () => {}),
    ping: partial.ping ?? (async () => ({ latencyMs: 1, connection: 'direct' })),
    equals: (other) => other.ref === peer.ref,
    ref: partial.ref,
    tailscaleId: partial.tailscaleId,
  };
  return peer;
}

export type StoreEvent = {
  eventType: string;
  deviceId?: string;
  data?: unknown;
  version?: number;
};

export class MockSyncedStore {
  private localData: unknown = null;
  private remotes = new Map<string, { data: unknown; version: number; updatedAt: number }>();
  private listeners: Array<(e: StoreEvent) => void> = [];
  readonly localDeviceId: string;
  setCalls: unknown[] = [];

  constructor(localDeviceId: string) {
    this.localDeviceId = localDeviceId;
  }

  async set(data: unknown): Promise<void> {
    this.localData = data;
    this.setCalls.push(data);
    for (const cb of this.listeners) {
      cb({ eventType: 'local_changed', deviceId: this.localDeviceId, data });
    }
  }

  async local(): Promise<unknown> {
    return this.localData;
  }

  async all(): Promise<
    Array<{ deviceId: string; data: unknown; version: number; updatedAt: number }>
  > {
    const out: Array<{ deviceId: string; data: unknown; version: number; updatedAt: number }> = [];
    if (this.localData !== null) {
      out.push({
        deviceId: this.localDeviceId,
        data: this.localData,
        version: 1,
        updatedAt: Date.now(),
      });
    }
    for (const [deviceId, slice] of this.remotes) {
      out.push({ deviceId, ...slice });
    }
    return out;
  }

  onChange(cb: (e: StoreEvent) => void): void {
    this.listeners.push(cb);
  }

  /** Simulate a remote peer publishing a slice. */
  emitPeerUpdated(deviceId: string, data: unknown): void {
    this.remotes.set(deviceId, { data, version: 1, updatedAt: Date.now() });
    for (const cb of this.listeners) {
      cb({ eventType: 'peer_updated', deviceId, data, version: 1 });
    }
  }

  emitPeerRemoved(deviceId: string): void {
    this.remotes.delete(deviceId);
    for (const cb of this.listeners) {
      cb({ eventType: 'peer_removed', deviceId });
    }
  }

  async stop(): Promise<void> {
    this.listeners = [];
  }
}

export class MockMeshNode {
  readonly localDeviceId: string;
  readonly localTailscaleId: string;
  peers: MockPeer[] = [];
  private peerListeners: Array<(e: MeshPeerEvent) => void> = [];
  private messageListeners = new Map<string, Array<(msg: MeshNamespacedMessage) => void>>();
  private store: MockSyncedStore;
  sent: Array<{ to: unknown; namespace: string; data: Buffer }> = [];

  constructor(opts?: { deviceId?: string; tailscaleId?: string }) {
    this.localDeviceId = opts?.deviceId ?? '01LOCALDEVICEID000000000000';
    this.localTailscaleId = opts?.tailscaleId ?? 'nLocalTailscaleId';
    this.store = new MockSyncedStore(this.localDeviceId);
  }

  getLocalInfo() {
    return {
      appId: 'avocado-test',
      deviceId: this.localDeviceId,
      deviceName: 'test-device',
      tailscaleHostname: 'truffle-avocado-test-test-device',
      tailscaleId: this.localTailscaleId,
    };
  }

  async getPeers(): Promise<MockPeer[]> {
    return [...this.peers];
  }

  onPeerChange(cb: (e: MeshPeerEvent) => void): void {
    this.peerListeners.push(cb);
  }

  onMessage(namespace: string, cb: (msg: MeshNamespacedMessage) => void): void {
    const list = this.messageListeners.get(namespace) ?? [];
    list.push(cb);
    this.messageListeners.set(namespace, list);
  }

  async send(to: unknown, namespace: string, data: Buffer | Uint8Array): Promise<void> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.sent.push({ to, namespace, data: buf });
  }

  syncedStore(_id: string): MockSyncedStore {
    return this.store;
  }

  getStore(): MockSyncedStore {
    return this.store;
  }

  emitPeerEvent(event: MeshPeerEvent): void {
    for (const cb of this.peerListeners) cb(event);
  }

  /** Deliver a message to all namespace subscribers. */
  deliverMessage(msg: MeshNamespacedMessage): void {
    const list = this.messageListeners.get(msg.namespace) ?? [];
    for (const cb of list) cb(msg);
  }

  addPeer(peer: MockPeer): void {
    this.peers.push(peer);
  }
}

/** EventEmitter-ish stand-in so MeshPTYTransport can `transport.on('disconnected')`. */
export function asTransportPeer(peer: MockPeer): MockPeer {
  return peer;
}
