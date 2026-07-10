import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRelaySessionManager } from '../../src/transport-truffle/relay-session-manager.js';
import { TestPTYSession } from '../helpers/mock-session.js';
import type { MeshPTYTransport } from '../../src/transport-truffle/mesh-pty-transport.js';

/** Minimal MeshPTYTransport surface for relay tests. */
function mockMeshTransport(peerId = 'peer-ref:1') {
  const ee = new EventEmitter();
  const sendOutput = vi.fn();
  const sendResized = vi.fn();
  const sendSessionEnded = vi.fn();
  return Object.assign(ee, {
    peerId,
    transportId: peerId,
    sendOutput,
    sendResized,
    sendSessionEnded,
  }) as unknown as MeshPTYTransport & {
    sendOutput: ReturnType<typeof vi.fn>;
    sendResized: ReturnType<typeof vi.fn>;
    sendSessionEnded: ReturnType<typeof vi.fn>;
  };
}

describe('RelaySessionManager', () => {
  it('forwards output/resized from source to transport', () => {
    const mgr = createRelaySessionManager();
    const source = new TestPTYSession({ id: 'local-sess', command: 'bash' });
    const transport = mockMeshTransport('viewer-1');

    const relay = mgr.createRelay(source, transport, 'viewer-1');
    expect(relay.viewerPeerId).toBe('viewer-1');
    expect(mgr.hasRelay('local-sess', 'viewer-1')).toBe(true);
    expect(mgr.getRelay('local-sess', 'viewer-1')).toBe(relay);

    source.simulateOutput('out');
    expect(transport.sendOutput).toHaveBeenCalledWith(
      'local-sess',
      expect.any(Buffer),
      'viewer-1'
    );

    source.resize(100, 40);
    expect(transport.sendResized).toHaveBeenCalledWith('local-sess', 100, 40, 'viewer-1');

    mgr.dispose();
  });

  it('reuses existing relay for same pair', () => {
    const mgr = createRelaySessionManager();
    const source = new TestPTYSession({ id: 's', command: 'bash' });
    const transport = mockMeshTransport();
    const a = mgr.createRelay(source, transport, 'v1');
    const b = mgr.createRelay(source, transport, 'v1');
    expect(a).toBe(b);
    mgr.dispose();
  });

  it('disposeRelay and cleanupForDevice remove relays', () => {
    const mgr = createRelaySessionManager();
    const source = new TestPTYSession({ id: 's', command: 'bash' });
    const t1 = mockMeshTransport('p1');
    const t2 = mockMeshTransport('p2');
    mgr.createRelay(source, t1, 'p1');
    mgr.createRelay(source, t2, 'p2');
    expect(mgr.getRelaysForSession('s').size).toBe(2);

    mgr.disposeRelay('s', 'p1');
    expect(mgr.hasRelay('s', 'p1')).toBe(false);
    expect(mgr.getRelaysForSession('s').size).toBe(1);

    const cleaned = mgr.cleanupForDevice('p2');
    expect(cleaned).toBe(1);
    expect(mgr.getRelaysForSession('s').size).toBe(0);
    mgr.dispose();
  });

  it('source exit sends sessionEnded and drops relay', () => {
    const mgr = createRelaySessionManager();
    const source = new TestPTYSession({ id: 's', command: 'bash' });
    const transport = mockMeshTransport('v');
    mgr.createRelay(source, transport, 'v');
    source.kill();
    expect(transport.sendSessionEnded).toHaveBeenCalledWith('s', 0, 'v');
    expect(mgr.hasRelay('s', 'v')).toBe(false);
    mgr.dispose();
  });

  it('transport disconnect disposes relay', () => {
    const mgr = createRelaySessionManager();
    const source = new TestPTYSession({ id: 's', command: 'bash' });
    const transport = mockMeshTransport('v');
    mgr.createRelay(source, transport, 'v');
    (transport as unknown as EventEmitter).emit('disconnected', 'bye');
    expect(mgr.hasRelay('s', 'v')).toBe(false);
    mgr.dispose();
  });
});
