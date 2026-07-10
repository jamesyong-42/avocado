import { describe, it, expect, vi } from 'vitest';
import { createPTYSessionManager } from '#core';
import { PTYMeshBridge } from '../../src/transport-truffle/pty-mesh-bridge.js';
import { createMockPeer, MockMeshNode } from '../helpers/mock-mesh.js';
import type { MeshNode, Peer } from '@vibecook/truffle';

describe('PTYMeshBridge', () => {
  it('seeds transports for online peers (not only wsConnected)', async () => {
    const node = new MockMeshNode();
    const peer = createMockPeer({
      ref: 'nB:1',
      tailscaleId: 'nB',
      displayName: 'b',
      deviceId: '01BDEVICEID000000000000000',
      online: true,
      wsConnected: false,
    });
    node.addPeer(peer);

    const sessionManager = createPTYSessionManager();
    const bridge = new PTYMeshBridge({
      node: node as unknown as MeshNode,
      sessionManager,
    });
    await bridge.initialize();

    expect(bridge.getTransportCount()).toBe(1);
    const t = bridge.getTransport(peer.ref);
    expect(t).not.toBeNull();
    expect(t!.peerName).toBe('b');
    expect(bridge.getTransportByDeviceId(peer.deviceId!)).toBe(t);
    expect(bridge.getTransportForPeer(peer as unknown as Peer)).toBe(t);

    bridge.dispose();
    sessionManager.dispose();
  });

  it('creates transport on joined / identity and indexes deviceId', async () => {
    const node = new MockMeshNode();
    const sessionManager = createPTYSessionManager();
    const bridge = new PTYMeshBridge({
      node: node as unknown as MeshNode,
      sessionManager,
    });
    await bridge.initialize();
    expect(bridge.getTransportCount()).toBe(0);

    const created = vi.fn();
    bridge.on('transportCreated', created);

    const peer = createMockPeer({
      ref: 'nC:1',
      tailscaleId: 'nC',
      displayName: 'c',
      deviceId: null,
      online: true,
      wsConnected: false,
    });
    node.addPeer(peer);
    node.emitPeerEvent({ type: 'joined', peerId: peer.tailscaleId, peer: peer as unknown as Peer });
    expect(bridge.getTransportCount()).toBe(1);
    expect(created).toHaveBeenCalledWith(peer.ref, expect.anything());

    // Identity arrives — same ref, index by deviceId
    peer.deviceId = '01CDEVICEID000000000000000';
    node.emitPeerEvent({
      type: 'identity',
      peerId: peer.tailscaleId,
      peer: peer as unknown as Peer,
    });
    expect(bridge.getTransportByDeviceId('01CDEVICEID000000000000000')).not.toBeNull();

    // ws_disconnected is soft — transport remains
    node.emitPeerEvent({
      type: 'ws_disconnected',
      peerId: peer.tailscaleId,
      peer: peer as unknown as Peer,
    });
    expect(bridge.getTransportCount()).toBe(1);

    // left removes
    const removed = vi.fn();
    bridge.on('transportRemoved', removed);
    node.emitPeerEvent({
      type: 'left',
      peerId: peer.tailscaleId,
      peer: peer as unknown as Peer,
    });
    expect(bridge.getTransportCount()).toBe(0);
    expect(removed).toHaveBeenCalledWith(peer.ref, 'left');

    bridge.dispose();
    sessionManager.dispose();
  });

  it('idempotent initialize', async () => {
    const node = new MockMeshNode();
    const sessionManager = createPTYSessionManager();
    const bridge = new PTYMeshBridge({
      node: node as unknown as MeshNode,
      sessionManager,
    });
    await bridge.initialize();
    await bridge.initialize();
    expect(bridge.isInitialized()).toBe(true);
    bridge.dispose();
    expect(bridge.isInitialized()).toBe(false);
    sessionManager.dispose();
  });
});
