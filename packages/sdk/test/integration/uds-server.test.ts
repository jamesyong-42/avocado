/**
 * Integration: UDSServer handshake + namespace routing over a real socket.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createConnection, type Socket } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createUDSServer } from '../../src/transport-ipc/uds-server.js';
import { encodeMessage, decodeFrame, PTY_NAMESPACE } from '../../src/transport-ipc/wire.js';

const sockets: string[] = [];

function tempSock(): string {
  const p =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\avocado-test-${randomUUID()}`
      : join(tmpdir(), `avocado-uds-${randomUUID()}.sock`);
  sockets.push(p);
  return p;
}

function readMessage(socket: Socket, timeoutMs = 3000): Promise<ReturnType<typeof decodeFrame>> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout waiting for frame'));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        const decoded = decodeFrame(buf);
        if (decoded) {
          cleanup();
          resolve(decoded);
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', onData);
    };
    socket.on('data', onData);
  });
}

describe('UDSServer integration', () => {
  afterEach(() => {
    // Unix socket files cleaned by server.dispose; keep list for debugging only.
    sockets.length = 0;
  });

  it('accepts hello, replies welcome, and routes namespace messages', async () => {
    const path = tempSock();
    const server = createUDSServer();
    server.start({ socketPath: path });

    const ready = vi.fn();
    server.on('connectionReady', ready);

    const handler = vi.fn();
    server.registerEndpoint(PTY_NAMESPACE, handler);

    const client = createConnection(path);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('error', reject);
    });

    // Client hello (handshake lives on the pty namespace)
    client.write(
      encodeMessage({
        namespace: PTY_NAMESPACE,
        type: 'hello',
        payload: { version: '0.1.0', pid: process.pid },
        timestamp: Date.now(),
      })
    );

    const welcome = await readMessage(client);
    expect(welcome?.message.type).toBe('welcome');
    await vi.waitFor(() => expect(ready).toHaveBeenCalled());

    // App message after handshake
    client.write(
      encodeMessage({
        namespace: PTY_NAMESPACE,
        type: 'pty:input',
        payload: { sessionId: 's', data: 'eA==' },
        timestamp: Date.now(),
      })
    );

    await vi.waitFor(() => expect(handler).toHaveBeenCalled());
    const [connId, msg] = handler.mock.calls[0];
    expect(typeof connId).toBe('string');
    expect(msg.type).toBe('pty:input');

    // Server → client via sendNamespaced
    server.sendNamespaced(connId, PTY_NAMESPACE, 'pty:output', {
      sessionId: 's',
      data: 'eQ==',
    });
    const out = await readMessage(client);
    expect(out?.message.type).toBe('pty:output');

    client.end();
    server.dispose();
  });
});
