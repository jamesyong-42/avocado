/**
 * IPCSessionHost ↔ UDSServer integration.
 *
 * Runs a real hub (UDSServer + PTYIPCBridge + PTYSessionManager) and a real
 * owner-side IPCSessionHost over a temp socket, and exercises:
 *  - handshake + multi-session announce (with buffered-scrollback seeding)
 *  - byte-exact output relay when normalizeOutput is disabled
 *  - input / resize / kill routing back to the owner's sessions
 *  - hub-initiated spawn:request via IPCPTYTransport.requestSpawn
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BasePTYSession } from '#types';
import { createPTYSessionManager } from '#core';
import {
  createIPCSessionHost,
  createPTYIPCBridge,
  createUDSServer,
  type IPCPTYTransport,
  type IPCSessionHost,
  type UDSServer,
} from '#transport-ipc';

// ─── fixtures ───────────────────────────────────────────────────────────────

let nextId = 0;

class FakeSession extends BasePTYSession {
  readonly written: Buffer[] = [];
  killedWith: string | undefined | null = null;

  constructor(id = `fake-${++nextId}`) {
    super({
      id,
      source: 'local',
      pid: 4242,
      command: '/bin/fake',
      cwd: '/tmp',
      cols: 80,
      rows: 24,
      isRunning: true,
    });
  }

  feed(data: Buffer): void {
    this.pushOutput(data);
  }

  exitWith(code: number): void {
    this.setExited(code);
  }

  override write(data: string | Buffer): void {
    this.written.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
  }

  override resize(cols: number, rows: number): void {
    this.setSize(cols, rows);
  }

  override kill(signal?: string): void {
    this.killedWith = signal ?? null;
    this.setExited(0, signal);
  }
}

function waitFor<T>(check: () => T | undefined, label: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = (): void => {
      const value = check();
      if (value !== undefined) return resolve(value);
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${label}`));
      setTimeout(poll, 10);
    };
    poll();
  });
}

// ─── harness ────────────────────────────────────────────────────────────────

interface Harness {
  server: UDSServer;
  host: IPCSessionHost;
  transport: () => IPCPTYTransport | undefined;
  outputs: Array<{ sessionId: string; data: Buffer }>;
  announced: string[];
}

const cleanups: Array<() => void> = [];

async function startHarness(options: { normalizeOutput: boolean; spawnHandler?: (config: unknown) => FakeSession }): Promise<Harness> {
  const socketPath = join(mkdtempSync(join(tmpdir(), 'avocado-host-')), 'test.sock');

  const manager = createPTYSessionManager();
  const server = createUDSServer();
  const bridge = createPTYIPCBridge(manager, { transport: { normalizeOutput: options.normalizeOutput } });
  server.start({ socketPath });
  bridge.initialize(server);

  const outputs: Array<{ sessionId: string; data: Buffer }> = [];
  const announced: string[] = [];
  let transport: IPCPTYTransport | undefined;

  bridge.on('transportCreated', (_id, t) => {
    transport = t;
    t.on('output', (sessionId: string, data: Buffer) => outputs.push({ sessionId, data }));
    t.on('sessionAnnounced', (info) => announced.push(info.sessionId));
  });

  const host = createIPCSessionHost({
    socketPath,
    autoRetry: false,
    spawnHandler: options.spawnHandler
      ? async (config) => options.spawnHandler!(config)
      : undefined,
  });

  const connected = new Promise<void>((resolve) => host.once('connect', () => resolve()));
  await host.connect();
  await connected;

  cleanups.push(() => {
    host.dispose();
    bridge.dispose();
    server.dispose();
  });

  return { server, host, transport: () => transport, outputs, announced };
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe('IPCSessionHost over UDS', () => {
  it('announces sessions with buffered scrollback and relays output byte-exactly', async () => {
    const h = await startHarness({ normalizeOutput: false });
    const session = new FakeSession();
    session.feed(Buffer.from('early scrollback\r\n'));

    h.host.addSession(session);
    await waitFor(() => (h.announced.includes(session.id) ? true : undefined), 'announce');

    // Scrollback seeded as a normal output message right after announce.
    await waitFor(() => (h.outputs.length > 0 ? true : undefined), 'scrollback output');
    expect(h.outputs[0].data.toString('utf8')).toBe('early scrollback\r\n');

    // Byte-exact relay: malformed UTF-8 and focus-tracking sequences survive
    // untouched with normalizeOutput disabled.
    const nasty = Buffer.concat([Buffer.from('\x1b[I'), Buffer.from([0xff, 0xfe, 0x80]), Buffer.from('\n')]);
    session.feed(nasty);
    const relayed = await waitFor(() => h.outputs.find((o) => o.data.includes(0xff))?.data, 'nasty bytes');
    expect(Buffer.compare(relayed, nasty)).toBe(0);
  });

  it('routes input, resize, and kill from the hub to the owning session', async () => {
    const h = await startHarness({ normalizeOutput: false });
    const session = new FakeSession();
    h.host.addSession(session);
    await waitFor(() => (h.announced.includes(session.id) ? true : undefined), 'announce');

    h.transport()!.sendInput(session.id, Buffer.from('typed\r'));
    await waitFor(() => (session.written.length > 0 ? true : undefined), 'input');
    expect(session.written[0].toString('utf8')).toBe('typed\r');

    h.transport()!.sendResize(session.id, 120, 40);
    await waitFor(() => (session.cols === 120 ? true : undefined), 'resize');
    expect(session.rows).toBe(40);

    h.transport()!.sendKill(session.id, 'SIGTERM');
    await waitFor(() => (session.killedWith !== null ? true : undefined), 'kill');
    expect(session.killedWith).toBe('SIGTERM');
  });

  it('spawns sessions on hub request: announce precedes the resolved response', async () => {
    let spawnedSession: FakeSession | undefined;
    const h = await startHarness({
      normalizeOutput: false,
      spawnHandler: (config) => {
        expect((config as { command: string }).command).toBe('/bin/wanted');
        spawnedSession = new FakeSession('spawned-1');
        return spawnedSession;
      },
    });
    await waitFor(() => h.transport(), 'transport');

    const result = await h.transport()!.requestSpawn({ command: '/bin/wanted', cols: 100, rows: 30 });
    expect(result.sessionId).toBe('spawned-1');
    // The announce must already have arrived when the promise resolves.
    expect(h.announced).toContain('spawned-1');
    expect(spawnedSession).toBeDefined();
  });

  it('rejects spawn requests when the host has no spawn handler', async () => {
    const h = await startHarness({ normalizeOutput: false });
    await waitFor(() => h.transport(), 'transport');
    await expect(h.transport()!.requestSpawn({ command: '/bin/anything' })).rejects.toThrow(/spawn not supported/);
  });

  it('session exit propagates as session:end and unhosts the session', async () => {
    const h = await startHarness({ normalizeOutput: false });
    const session = new FakeSession();
    h.host.addSession(session);
    await waitFor(() => (h.announced.includes(session.id) ? true : undefined), 'announce');

    const ended = new Promise<number>((resolve) => {
      h.transport()!.on('sessionEnded', (_sessionId: string, exitCode: number) => resolve(exitCode));
    });
    session.exitWith(3);
    expect(await ended).toBe(3);
    expect(h.host.getSessions()).toHaveLength(0);
  });
});
