import { describe, it, expect, vi } from 'vitest';
import {
  MeshPTYTransport,
  PTY_NAMESPACE,
} from '../../src/transport-truffle/mesh-pty-transport.js';
import { WS_PTY_MESSAGE_TYPES } from '#types';
import { createMockPeer, MockMeshNode } from '../helpers/mock-mesh.js';
import type { MeshNode, Peer } from '@vibecook/truffle';

function setup() {
  const node = new MockMeshNode();
  const peer = createMockPeer({
    ref: 'nPeer:1',
    tailscaleId: 'nPeer',
    displayName: 'remote',
    deviceId: '01REMOTEDEVICE000000000000',
    send: vi.fn(async () => {}),
  });
  const transport = new MeshPTYTransport({
    node: node as unknown as MeshNode,
    peer: peer as unknown as Peer,
    isConnected: true,
  });
  return { node, peer, transport };
}

describe('MeshPTYTransport', () => {
  it('exposes peer-ref identity', () => {
    const { transport, peer } = setup();
    expect(transport.transportId).toBe(peer.ref);
    expect(transport.peerId).toBe(peer.ref);
    expect(transport.peerName).toBe('remote');
    expect(transport.deviceId).toBe(peer.deviceId);
    expect(transport.transportType).toBe('ws');
    expect(transport.isReady).toBe(true);
    transport.dispose();
  });

  it('sendWire uses peer.send with JSON payload', async () => {
    const { transport, peer } = setup();
    transport.sendInput('sess', 'hi');
    // fire-and-forget
    await vi.waitFor(() => expect(peer.send).toHaveBeenCalled());
    const [ns, buf] = (peer.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ns).toBe(PTY_NAMESPACE);
    const msg = JSON.parse(Buffer.from(buf).toString());
    expect(msg.type).toBe(WS_PTY_MESSAGE_TYPES.INPUT);
    expect(msg.sessionId).toBe('sess');
    expect(Buffer.from(msg.data, 'base64').toString()).toBe('hi');
    transport.dispose();
  });

  it('filters inbound messages by peer and emits events', () => {
    const { node, peer, transport } = setup();
    const onOut = vi.fn();
    const onIn = vi.fn();
    transport.on('output', onOut);
    transport.on('inputReceived', onIn);

    // Wrong peer — ignored
    node.deliverMessage({
      from: createMockPeer({ ref: 'other:1', tailscaleId: 'other' }) as unknown as Peer,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: {
        type: WS_PTY_MESSAGE_TYPES.OUTPUT,
        sessionId: 's',
        data: Buffer.from('nope').toString('base64'),
      },
    });
    expect(onOut).not.toHaveBeenCalled();

    // Correct Peer handle
    node.deliverMessage({
      from: peer as unknown as Peer,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: {
        type: WS_PTY_MESSAGE_TYPES.OUTPUT,
        sessionId: 's',
        data: Buffer.from('yes').toString('base64'),
      },
    });
    expect(onOut).toHaveBeenCalledWith('s', Buffer.from('yes'));

    // String attribution via tailscaleId
    node.deliverMessage({
      from: peer.tailscaleId,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: {
        type: WS_PTY_MESSAGE_TYPES.INPUT,
        sessionId: 's',
        data: Buffer.from('typed').toString('base64'),
      },
    });
    expect(onIn).toHaveBeenCalledWith('s', Buffer.from('typed'));

    transport.dispose();
  });

  it('drops sends when not ready and after dispose', async () => {
    const { transport, peer } = setup();
    transport.handleDisconnected('blip');
    expect(transport.isReady).toBe(false);
    transport.sendInput('s', 'x');
    expect(peer.send).not.toHaveBeenCalled();

    transport.handleConnected();
    expect(transport.isReady).toBe(true);
    transport.dispose();
    expect(transport.isReady).toBe(false);
    transport.sendInput('s', 'y');
    // still only no calls (or not increased after dispose)
  });

  it('subscribe / unsubscribe / createRemoteSession encode correctly', async () => {
    const { transport, peer } = setup();
    transport.subscribe('s1');
    transport.unsubscribe('s1');
    transport.createRemoteSession({ command: 'bash', cwd: '/', cols: 80, rows: 24 });
    await vi.waitFor(() => expect(peer.send).toHaveBeenCalledTimes(3));
    const types = (peer.send as ReturnType<typeof vi.fn>).mock.calls.map(
      ([, buf]: [string, Buffer]) => JSON.parse(buf.toString()).type
    );
    expect(types).toEqual([
      WS_PTY_MESSAGE_TYPES.SUBSCRIBE,
      WS_PTY_MESSAGE_TYPES.UNSUBSCRIBE,
      WS_PTY_MESSAGE_TYPES.CREATE_SESSION,
    ]);
    transport.dispose();
  });

  it('owner-side sendOutput accepts matching target keys', async () => {
    const { transport, peer } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    transport.sendOutput('s', Buffer.from('x'), peer.ref);
    transport.sendOutput('s', Buffer.from('y'), peer.deviceId!);
    transport.sendOutput('s', Buffer.from('z'), 'wrong-target');
    await vi.waitFor(() => expect(peer.send).toHaveBeenCalledTimes(3));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    transport.dispose();
  });
});
