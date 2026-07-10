import { describe, it, expect, vi } from 'vitest';
import { PTYSyncStore } from '../../src/transport-truffle/pty-sync-store.js';
import { MockMeshNode } from '../helpers/mock-mesh.js';
import type { MeshNode } from '@vibecook/truffle';

describe('PTYSyncStore', () => {
  it('publishes and reads local sessions', async () => {
    const node = new MockMeshNode({ deviceId: '01LOCAL' });
    const store = new PTYSyncStore({ node: node as unknown as MeshNode });
    expect(store.getLocalDeviceId()).toBe('01LOCAL');
    expect(store.getStoreId()).toBe('avocado-pty-sessions');

    await store.setLocalSessions([]);
    expect(await store.getLocalSessions()).toEqual([]);

    const sessions = [
      {
        sessionId: 's1',
        pid: 1,
        command: 'bash',
        cwd: '/',
        cols: 80,
        rows: 24,
      },
    ];
    await store.setLocalSessions(sessions);
    expect(await store.getLocalSessions()).toEqual(sessions);
    expect(node.getStore().setCalls).toHaveLength(2);

    await store.dispose();
  });

  it('getRemoteSessions excludes local and coerces bad slices', async () => {
    const node = new MockMeshNode({ deviceId: '01LOCAL' });
    const store = new PTYSyncStore({ node: node as unknown as MeshNode });
    await store.setLocalSessions([{ sessionId: 'mine', pid: 1, command: 'x', cwd: '/', cols: 1, rows: 1 }]);
    node.getStore().emitPeerUpdated('01REMOTE', {
      sessions: [{ sessionId: 'theirs', pid: 2, command: 'y', cwd: '/', cols: 2, rows: 2 }],
      updatedAt: Date.now(),
    });
    node.getStore().emitPeerUpdated('01BAD', { not: 'valid' });

    const remote = await store.getRemoteSessions();
    expect(remote.has('01LOCAL')).toBe(false);
    expect(remote.get('01REMOTE')?.[0]?.sessionId).toBe('theirs');
    expect(remote.get('01BAD')).toEqual([]);
    await store.dispose();
  });

  it('onRemoteChange fires for peer_updated and peer_removed', async () => {
    const node = new MockMeshNode();
    const store = new PTYSyncStore({ node: node as unknown as MeshNode });
    const cb = vi.fn();
    store.onRemoteChange(cb);

    node.getStore().emitPeerUpdated('01R', {
      sessions: [{ sessionId: 'a', pid: 1, command: 'bash', cwd: '/', cols: 80, rows: 24 }],
      updatedAt: 1,
    });
    expect(cb).toHaveBeenCalledWith('01R', expect.any(Array));

    node.getStore().emitPeerRemoved('01R');
    expect(cb).toHaveBeenCalledWith('01R', null);

    // local_changed ignored
    await store.setLocalSessions([]);
    expect(cb).toHaveBeenCalledTimes(2);

    await store.dispose();
  });
});
