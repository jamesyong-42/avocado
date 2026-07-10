import { describe, it, expect, vi } from 'vitest';
import { createPTYSessionManager } from '#core';
import { WS_PTY_MESSAGE_TYPES } from '#types';
import { PTYMeshBridge } from '../../src/transport-truffle/pty-mesh-bridge.js';
import { PTYSyncStore } from '../../src/transport-truffle/pty-sync-store.js';
import { RemoteSessionService } from '../../src/transport-truffle/remote-session-service.js';
import { PTY_NAMESPACE } from '../../src/transport-truffle/mesh-pty-transport.js';
import { createMockPeer, MockMeshNode } from '../helpers/mock-mesh.js';
import { TestPTYSession } from '../helpers/mock-session.js';
import type { MeshNode, Peer } from '@vibecook/truffle';

async function setupStack() {
  const node = new MockMeshNode({ deviceId: '01OWNER' });
  const peer = createMockPeer({
    ref: 'nViewer:1',
    tailscaleId: 'nViewer',
    displayName: 'viewer',
    deviceId: '01VIEWER',
    online: true,
    send: vi.fn(async () => {}),
  });
  node.addPeer(peer);

  const sessionManager = createPTYSessionManager();
  const local = new TestPTYSession({ id: 'local-sess', command: 'bash', source: 'local' });
  sessionManager.registerSession(local);

  const bridge = new PTYMeshBridge({
    node: node as unknown as MeshNode,
    sessionManager,
  });
  const syncStore = new PTYSyncStore({ node: node as unknown as MeshNode });
  const notifier = {
    sessionFocusChanged: vi.fn(),
    remoteSessionsChanged: vi.fn(),
  };
  const service = new RemoteSessionService({
    node: node as unknown as MeshNode,
    sessionManager,
    bridge,
    syncStore,
    notifier,
  });

  await bridge.initialize();
  await service.enable();

  return { node, peer, sessionManager, local, bridge, syncStore, service, notifier };
}

describe('RemoteSessionService', () => {
  it('enable publishes local sessions to sync store', async () => {
    const { node, service, syncStore, sessionManager, bridge } = await setupStack();
    const local = await syncStore.getLocalSessions();
    expect(local.some((s) => s.sessionId === 'local-sess')).toBe(true);
    await service.dispose();
    await syncStore.dispose();
    bridge.dispose();
    sessionManager.dispose();
    void node;
  });

  it('SUBSCRIBE creates relay and replays buffer', async () => {
    const { node, peer, local, service, bridge, sessionManager, syncStore } = await setupStack();
    local.simulateOutput('buffered');

    node.deliverMessage({
      from: peer as unknown as Peer,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: { type: WS_PTY_MESSAGE_TYPES.SUBSCRIBE, sessionId: 'local-sess' },
    });

    expect(service.getRelayManager().hasRelay('local-sess', peer.ref)).toBe(true);
    // Replay went through peer.send via MeshPTYTransport
    await vi.waitFor(() => expect(peer.send).toHaveBeenCalled());
    const payloads = (peer.send as ReturnType<typeof vi.fn>).mock.calls.map(
      ([, buf]: [string, Buffer]) => JSON.parse(Buffer.from(buf).toString())
    );
    expect(payloads.some((p) => p.type === WS_PTY_MESSAGE_TYPES.OUTPUT)).toBe(true);

    node.deliverMessage({
      from: peer as unknown as Peer,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: { type: WS_PTY_MESSAGE_TYPES.UNSUBSCRIBE, sessionId: 'local-sess' },
    });
    expect(service.getRelayManager().hasRelay('local-sess', peer.ref)).toBe(false);

    await service.dispose();
    await syncStore.dispose();
    bridge.dispose();
    sessionManager.dispose();
  });

  it('INPUT writes to session and FOCUS notifies', async () => {
    const { node, peer, local, service, bridge, sessionManager, syncStore, notifier } =
      await setupStack();

    node.deliverMessage({
      from: peer as unknown as Peer,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: {
        type: WS_PTY_MESSAGE_TYPES.INPUT,
        sessionId: 'local-sess',
        data: Buffer.from('typed').toString('base64'),
      },
    });
    expect(local.written.some((w) => Buffer.from(w as Buffer).toString() === 'typed' || w === 'typed' || Buffer.from(w as string).toString() === 'typed')).toBe(true);
    // write receives Buffer from service
    expect(local.written).toHaveLength(1);
    expect(Buffer.from(local.written[0] as Buffer).toString()).toBe('typed');

    node.deliverMessage({
      from: peer as unknown as Peer,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: {
        type: WS_PTY_MESSAGE_TYPES.FOCUS_CHANGED,
        sessionId: 'local-sess',
        focused: true,
      },
    });
    expect(notifier.sessionFocusChanged).toHaveBeenCalledWith(
      'local-sess',
      true,
      'remote',
      peer.ref
    );

    node.deliverMessage({
      from: peer as unknown as Peer,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: {
        type: WS_PTY_MESSAGE_TYPES.RESIZE,
        sessionId: 'local-sess',
        cols: 100,
        rows: 40,
      },
    });
    expect(local.cols).toBe(100);

    await service.dispose();
    await syncStore.dispose();
    bridge.dispose();
    sessionManager.dispose();
  });

  it('CREATE_SESSION replies CREATE_FAILED', async () => {
    const { node, peer, service, bridge, sessionManager, syncStore } = await setupStack();
    node.deliverMessage({
      from: peer as unknown as Peer,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: { type: WS_PTY_MESSAGE_TYPES.CREATE_SESSION, command: 'bash' },
    });
    await vi.waitFor(() => expect(peer.send).toHaveBeenCalled());
    const last = (peer.send as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    const body = JSON.parse(Buffer.from(last[1]).toString());
    expect(body.type).toBe(WS_PTY_MESSAGE_TYPES.CREATE_FAILED);

    await service.dispose();
    await syncStore.dispose();
    bridge.dispose();
    sessionManager.dispose();
  });

  it('remote store change announces sessions on matching transport', async () => {
    const { node, peer, service, bridge, sessionManager, syncStore, notifier } =
      await setupStack();

    // Factory so announcements become proxies
    sessionManager.setProxySessionFactory((_t, opts) =>
      new TestPTYSession({
        id: opts.id,
        command: opts.command,
        source: opts.source,
        cwd: opts.cwd,
      })
    );

    const t = bridge.getTransport(peer.ref)!;
    const announced = vi.fn();
    t.on('sessionAnnounced', announced);

    node.getStore().emitPeerUpdated(peer.deviceId!, {
      sessions: [
        {
          sessionId: 'remote-1',
          pid: 3,
          command: 'zsh',
          cwd: '/r',
          cols: 80,
          rows: 24,
        },
      ],
      updatedAt: Date.now(),
    });

    // RemoteSessionService listens on syncStore.onRemoteChange
    await vi.waitFor(() => expect(announced).toHaveBeenCalled());
    expect(notifier.remoteSessionsChanged).toHaveBeenCalledWith(peer.deviceId, 1);

    await service.dispose();
    await syncStore.dispose();
    bridge.dispose();
    sessionManager.dispose();
  });

  it('disable is idempotent and stops processing', async () => {
    const { node, peer, local, service, bridge, sessionManager, syncStore } = await setupStack();
    await service.disable();
    expect(service.isEnabled()).toBe(false);

    node.deliverMessage({
      from: peer as unknown as Peer,
      namespace: PTY_NAMESPACE,
      msgType: 'data',
      payload: {
        type: WS_PTY_MESSAGE_TYPES.INPUT,
        sessionId: 'local-sess',
        data: Buffer.from('x').toString('base64'),
      },
    });
    expect(local.written).toHaveLength(0);

    await service.dispose();
    await syncStore.dispose();
    bridge.dispose();
    sessionManager.dispose();
  });
});
