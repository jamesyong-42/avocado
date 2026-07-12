import { describe, it, expect, vi } from 'vitest';
import { ProxyPTYSession, createProxyPTYSession } from '#core';
import type { ProxyPTYSessionOptions } from '#core';
import { MockTransport } from '../helpers/mock-transport.js';

// Namespaced id differs from the remote id on purpose: operations must forward
// the REMOTE id to the transport, never the namespaced one.
const REMOTE_ID = 'remote-sess';
const NAMESPACED_ID = 'ws:transport-1:remote-sess';

function makeOptions(
  overrides: Partial<ProxyPTYSessionOptions> = {}
): ProxyPTYSessionOptions {
  return {
    id: NAMESPACED_ID,
    source: 'ws',
    remoteSessionId: REMOTE_ID,
    pid: 42,
    command: 'bash',
    cwd: '/work',
    cols: 80,
    rows: 24,
    metadata: { deviceId: 'transport-1', clientVersion: '1.0.0' },
    ...overrides,
  };
}

describe('ProxyPTYSession', () => {
  it('feeds matching-id output into the buffer + output event, ignores other ids', () => {
    const transport = new MockTransport('transport-1', 'ws');
    const session = new ProxyPTYSession(transport, makeOptions());
    const onOutput = vi.fn();
    session.on('output', onOutput);

    transport.emit('output', REMOTE_ID, Buffer.from('hello'));
    expect(onOutput).toHaveBeenCalledOnce();
    expect(onOutput).toHaveBeenCalledWith(Buffer.from('hello'));
    expect(session.getOutputBuffer()?.toString()).toBe('hello');

    // Output for a different remote session must be ignored entirely.
    transport.emit('output', 'someone-else', Buffer.from('nope'));
    expect(onOutput).toHaveBeenCalledOnce();
    expect(session.getOutputBuffer()?.toString()).toBe('hello');

    session.dispose();
  });

  it('forwards write/resize/kill to the transport using the REMOTE session id', () => {
    const transport = new MockTransport('transport-1', 'ws');
    const session = new ProxyPTYSession(transport, makeOptions());

    session.write('ls\n');
    session.resize(120, 40);
    session.kill('SIGTERM');

    expect(transport.sent).toEqual([
      { method: 'sendInput', args: [REMOTE_ID, 'ls\n'] },
      { method: 'sendResize', args: [REMOTE_ID, 120, 40] },
      { method: 'sendKill', args: [REMOTE_ID, 'SIGTERM'] },
    ]);

    session.dispose();
  });

  it('defers local resize until the remote resized event echoes back', () => {
    const transport = new MockTransport('transport-1', 'ws');
    const session = new ProxyPTYSession(transport, makeOptions());
    const onResized = vi.fn();
    session.on('resized', onResized);

    // resize() sends to the transport but does not touch local dims yet.
    session.resize(120, 40);
    expect(session.cols).toBe(80);
    expect(session.rows).toBe(24);
    expect(onResized).not.toHaveBeenCalled();

    // The remote confirms via a resized event keyed by the remote id.
    transport.emit('resized', REMOTE_ID, 120, 40);
    expect(session.cols).toBe(120);
    expect(session.rows).toBe(40);
    expect(onResized).toHaveBeenCalledWith(120, 40);

    // A resized event for another id is ignored.
    transport.emit('resized', 'someone-else', 10, 10);
    expect(session.cols).toBe(120);
    expect(session.rows).toBe(40);

    session.dispose();
  });

  it('marks the session exited on a matching sessionEnded event', () => {
    const transport = new MockTransport('transport-1', 'ws');
    const session = new ProxyPTYSession(transport, makeOptions());
    const onExit = vi.fn();
    session.on('exit', onExit);

    // Wrong id does nothing.
    transport.emit('sessionEnded', 'someone-else', 9);
    expect(session.isRunning).toBe(true);
    expect(onExit).not.toHaveBeenCalled();

    transport.emit('sessionEnded', REMOTE_ID, 3);
    expect(onExit).toHaveBeenCalledWith(3, undefined);
    expect(session.isRunning).toBe(false);
    expect(session.exitCode).toBe(3);

    // Once exited, operations are guarded (no further transport sends).
    session.write('too late');
    expect(transport.sent).toHaveLength(0);

    session.dispose();
  });

  it('detaches transport listeners on dispose and leaks no events afterward', () => {
    const transport = new MockTransport('transport-1', 'ws');
    const session = new ProxyPTYSession(transport, makeOptions());

    expect(transport.listenerCount('output')).toBe(1);
    expect(transport.listenerCount('resized')).toBe(1);
    expect(transport.listenerCount('sessionEnded')).toBe(1);
    expect(transport.listenerCount('focusChanged')).toBe(1);

    session.dispose();

    expect(transport.listenerCount('output')).toBe(0);
    expect(transport.listenerCount('resized')).toBe(0);
    expect(transport.listenerCount('sessionEnded')).toBe(0);
    expect(transport.listenerCount('focusChanged')).toBe(0);

    // Re-attach a listener and confirm transport events no longer reach it —
    // the session is fully detached from the transport.
    const onOutput = vi.fn();
    session.on('output', onOutput);
    transport.emit('output', REMOTE_ID, Buffer.from('late'));
    expect(onOutput).not.toHaveBeenCalled();

    // Idempotent: a second dispose is a no-op.
    expect(() => session.dispose()).not.toThrow();
  });

  it('createProxyPTYSession builds a working proxy (ProxySessionFactory shape)', () => {
    const transport = new MockTransport('transport-1', 'ws');
    const session = createProxyPTYSession(transport, makeOptions());

    expect(session).toBeInstanceOf(ProxyPTYSession);
    expect(session.id).toBe(NAMESPACED_ID);
    expect(session.source).toBe('ws');

    session.write('hi');
    expect(transport.sent).toEqual([
      { method: 'sendInput', args: [REMOTE_ID, 'hi'] },
    ]);

    session.dispose();
  });
});
