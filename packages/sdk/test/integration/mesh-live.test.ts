/**
 * Live mesh integration (optional).
 *
 * Requires TRUFFLE_TEST_AUTHKEY in the environment, or a readable
 * ../../truffle/.env (sibling checkout) / packages/sdk/.env with that key.
 *
 * Skip with: pnpm test -- --exclude "test/integration/mesh-live.test.ts"
 * Or leave the key unset — tests skip automatically.
 * Force skip: AVOCADO_SKIP_MESH_LIVE=1
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPTYSessionManager } from '#core';
import { PTYMeshBridge } from '../../src/transport-truffle/pty-mesh-bridge.js';
import { PTYSyncStore } from '../../src/transport-truffle/pty-sync-store.js';
import { RemoteSessionService } from '../../src/transport-truffle/remote-session-service.js';
import { PTY_NAMESPACE } from '../../src/transport-truffle/mesh-pty-transport.js';
import { WS_PTY_MESSAGE_TYPES } from '#types';
import { isPeer } from '@vibecook/truffle';

function loadAuthKey(): string | undefined {
  if (process.env.TRUFFLE_TEST_AUTHKEY?.trim()) {
    return process.env.TRUFFLE_TEST_AUTHKEY.trim();
  }
  const candidates = [
    join(process.cwd(), '.env'),
    join(process.cwd(), '../../truffle/.env'),
    join(process.cwd(), '../../../truffle/.env'),
    '/Users/jamesyong/Projects/project100/p008/truffle/.env',
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const raw = readFileSync(file, 'utf8');
      const m = raw.match(/^\s*TRUFFLE_TEST_AUTHKEY\s*=\s*(.+?)\s*$/m);
      if (!m) continue;
      let v = m[1];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

const authKey = loadAuthKey();
const runLive = Boolean(authKey) && process.env.AVOCADO_SKIP_MESH_LIVE !== '1';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  label: string,
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 45_000
): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn();
    if (v) return v as T;
    await sleep(400);
  }
  throw new Error(`timeout: ${label}`);
}

describe.skipIf(!runLive)('live truffle mesh (optional)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let createMeshNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodeA: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodeB: any;
  let baseDir: string;

  beforeAll(async () => {
    ({ createMeshNode } = await import('@vibecook/truffle'));
    baseDir = join(tmpdir(), `avocado-mesh-live-${Date.now()}`);
    mkdirSync(join(baseDir, 'a'), { recursive: true });
    mkdirSync(join(baseDir, 'b'), { recursive: true });

    nodeA = await createMeshNode({
      appId: 'avocado-sdk-test',
      deviceName: 'sdk-a',
      stateDir: join(baseDir, 'a'),
      authKey,
      ephemeral: true,
      autoAuth: false,
    });
    nodeB = await createMeshNode({
      appId: 'avocado-sdk-test',
      deviceName: 'sdk-b',
      stateDir: join(baseDir, 'b'),
      authKey,
      ephemeral: true,
      autoAuth: false,
    });
  }, 90_000);

  afterAll(async () => {
    try {
      await nodeA?.stop?.();
    } catch {
      /* */
    }
    try {
      await nodeB?.stop?.();
    } catch {
      /* */
    }
    try {
      rmSync(baseDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  }, 30_000);

  it('two nodes: Peer handles, transports for online peers, PTY send + SyncedStore', async () => {
    const idA = nodeA.getLocalInfo();
    const idB = nodeB.getLocalInfo();
    expect(idA.deviceId).not.toBe(idB.deviceId);

    await waitFor('discovery', async () => {
      const a = await nodeA.getPeers();
      const b = await nodeB.getPeers();
      return a.some((p: { online: boolean }) => p.online) && b.some((p: { online: boolean }) => p.online)
        ? true
        : null;
    });

    const peersA = await nodeA.getPeers();
    expect(isPeer(peersA[0])).toBe(true);

    const smA = createPTYSessionManager();
    const smB = createPTYSessionManager();
    const bridgeA = new PTYMeshBridge({ node: nodeA, sessionManager: smA });
    const bridgeB = new PTYMeshBridge({ node: nodeB, sessionManager: smB });
    const storeA = new PTYSyncStore({ node: nodeA });
    const storeB = new PTYSyncStore({ node: nodeB });
    const svcA = new RemoteSessionService({
      node: nodeA,
      sessionManager: smA,
      bridge: bridgeA,
      syncStore: storeA,
    });
    const svcB = new RemoteSessionService({
      node: nodeB,
      sessionManager: smB,
      bridge: bridgeB,
      syncStore: storeB,
    });

    await bridgeA.initialize();
    await bridgeB.initialize();
    expect(bridgeA.getTransportCount()).toBeGreaterThan(0);
    expect(bridgeB.getTransportCount()).toBeGreaterThan(0);

    await svcA.enable();
    await svcB.enable();

    const tA = [...bridgeA.getTransports().values()][0];
    const tB = [...bridgeB.getTransports().values()][0];
    expect(isPeer(tA.peer)).toBe(true);
    expect(tA.transportId).toBe(tA.peer.ref);

    if (tA.deviceId) {
      expect(bridgeA.getTransportByDeviceId(tA.deviceId)).toBe(tA);
    }

    let got: unknown = null;
    nodeB.onMessage(PTY_NAMESPACE, (msg: unknown) => {
      got = msg;
    });
    let input: { sessionId: string; data: string } | null = null;
    tB.on('inputReceived', (sessionId: string, data: Buffer) => {
      input = { sessionId, data: data.toString() };
    });

    await tA.peer.send(
      PTY_NAMESPACE,
      Buffer.from(
        JSON.stringify({
          type: WS_PTY_MESSAGE_TYPES.INPUT,
          sessionId: 'live-s',
          data: Buffer.from('live-hello').toString('base64'),
        })
      )
    );

    await waitFor('pty message', async () => (got || input ? true : null), 20_000);
    if (got && typeof got === 'object' && got !== null && 'from' in got) {
      const from = (got as { from: unknown }).from;
      expect(typeof from === 'string' || isPeer(from)).toBe(true);
    }
    if (input) {
      expect(input.data).toBe('live-hello');
    }

    await storeA.setLocalSessions([
      {
        sessionId: 'store-sess',
        pid: 1,
        command: 'bash',
        cwd: '/',
        cols: 80,
        rows: 24,
      },
    ]);
    const remote = await waitFor(
      'store sync',
      async () => {
        const map = await storeB.getRemoteSessions();
        const s = map.get(idA.deviceId);
        return s?.length ? s : null;
      },
      30_000
    );
    expect(remote[0].sessionId).toBe('store-sess');

    await svcA.dispose();
    await svcB.dispose();
    await storeA.dispose();
    await storeB.dispose();
    bridgeA.dispose();
    bridgeB.dispose();
    smA.dispose();
    smB.dispose();
  }, 120_000);
});
