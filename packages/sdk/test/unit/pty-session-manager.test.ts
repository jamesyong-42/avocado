import { describe, it, expect, vi } from 'vitest';
import { createPTYSessionManager } from '#core';
import { createNamespacedId } from '#types';
import { TestPTYSession } from '../helpers/mock-session.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('PTYSessionManager', () => {
  it('registers sessions and lists by source', () => {
    const mgr = createPTYSessionManager();
    const local = new TestPTYSession({ id: 'local-1', command: 'bash' });
    const ipc = new TestPTYSession({ id: 'ipc-1', command: 'zsh', source: 'ipc' });
    const discovered = vi.fn();
    mgr.on('sessionDiscovered', discovered);

    mgr.registerSession(local);
    mgr.registerSession(ipc);

    expect(mgr.getSessions()).toHaveLength(2);
    expect(mgr.getSessionsBySource('local')).toHaveLength(1);
    expect(mgr.getSession('local-1')).toBe(local);
    expect(discovered).toHaveBeenCalledTimes(2);
    expect(mgr.getSessionInfo('local-1')?.command).toBe('bash');

    // Duplicate register is a no-op
    mgr.registerSession(local);
    expect(mgr.getSessions()).toHaveLength(2);
    mgr.dispose();
  });

  it('forwards session events', () => {
    const mgr = createPTYSessionManager();
    const s = new TestPTYSession({ id: 's1', command: 'bash' });
    mgr.registerSession(s);

    const onOut = vi.fn();
    const onResize = vi.fn();
    const onFocus = vi.fn();
    const onExit = vi.fn();
    mgr.on('output', onOut);
    mgr.on('sessionResized', onResize);
    mgr.on('sessionFocusChanged', onFocus);
    mgr.on('exit', onExit);

    s.simulateOutput('hi');
    s.resize(90, 30);
    s.simulateFocus(true);
    s.kill();

    expect(onOut).toHaveBeenCalledWith({ sessionId: 's1', data: expect.any(Buffer) });
    expect(onResize).toHaveBeenCalledWith({ sessionId: 's1', cols: 90, rows: 30 });
    expect(onFocus).toHaveBeenCalledWith({ sessionId: 's1', focused: true });
    expect(onExit).toHaveBeenCalledWith({ sessionId: 's1', exitCode: 0, signal: undefined });
    // Exit removes session from manager
    expect(mgr.getSession('s1')).toBeNull();
    mgr.dispose();
  });

  it('write/resize/kill guard on missing or stopped sessions', () => {
    const mgr = createPTYSessionManager();
    const s = new TestPTYSession({ id: 's1', command: 'bash' });
    mgr.registerSession(s);

    expect(mgr.write('missing', 'x')).toBe(false);
    expect(mgr.write('s1', 'x')).toBe(true);
    expect(s.written).toHaveLength(1);
    expect(mgr.resize('s1', 10, 10)).toBe(true);
    expect(mgr.kill('s1')).toBe(true);
    expect(mgr.write('s1', 'y')).toBe(false);
    expect(mgr.getOutputBuffer('s1')).toBeNull(); // removed after exit

    mgr.dispose();
  });

  it('creates proxy sessions on transport announcement', () => {
    const mgr = createPTYSessionManager();
    const transport = new MockTransport('peer-ref:1', 'ws');
    const factory = vi.fn((t, opts) => {
      return new TestPTYSession({
        id: opts.id,
        command: opts.command,
        source: opts.source,
        cwd: opts.cwd,
        cols: opts.cols,
        rows: opts.rows,
        pid: opts.pid,
      });
    });
    mgr.setProxySessionFactory(factory);
    mgr.registerTransport(transport);

    transport.announce({
      sessionId: 'remote-sess',
      pid: 7,
      command: 'bash',
      cwd: '/work',
      cols: 80,
      rows: 24,
    });

    const expectedId = createNamespacedId('ws', 'peer-ref:1', 'remote-sess');
    expect(factory).toHaveBeenCalledOnce();
    expect(mgr.getSession(expectedId)).not.toBeNull();
    expect(mgr.getTransportIdForSession(expectedId)).toBe('peer-ref:1');
    expect(mgr.getTransport('peer-ref:1')).toBe(transport);

    mgr.dispose();
  });

  it('warns and skips announcement without factory', () => {
    const mgr = createPTYSessionManager();
    const transport = new MockTransport('t1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mgr.registerTransport(transport);
    transport.announce({
      sessionId: 'r',
      pid: 1,
      command: 'bash',
      cwd: '/',
      cols: 80,
      rows: 24,
    });
    expect(mgr.getSessions()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    mgr.dispose();
  });

  it('cleans up proxies on sessionEnded and disconnect', () => {
    const mgr = createPTYSessionManager();
    const transport = new MockTransport('t1', 'ws');
    mgr.setProxySessionFactory((t, opts) =>
      new TestPTYSession({
        id: opts.id,
        command: opts.command,
        source: opts.source,
        cwd: opts.cwd,
      })
    );
    mgr.registerTransport(transport);
    const lost = vi.fn();
    mgr.on('sessionLost', lost);

    transport.announce({
      sessionId: 'r1',
      pid: 1,
      command: 'bash',
      cwd: '/',
      cols: 80,
      rows: 24,
    });
    transport.announce({
      sessionId: 'r2',
      pid: 2,
      command: 'bash',
      cwd: '/',
      cols: 80,
      rows: 24,
    });
    expect(mgr.getSessions()).toHaveLength(2);

    transport.endSession('r1', 0);
    expect(lost).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'session_ended' })
    );
    expect(mgr.getSessions()).toHaveLength(1);

    transport.disconnect('network');
    expect(mgr.getSessions()).toHaveLength(0);
    expect(lost).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringContaining('transport_disconnected') })
    );

    mgr.unregisterTransport('t1');
    expect(mgr.getTransport('t1')).toBeNull();
    mgr.dispose();
  });
});
