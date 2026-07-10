import { describe, it, expect, vi } from 'vitest';
import { TestPTYSession } from '../helpers/mock-session.js';

describe('BasePTYSession (via TestPTYSession)', () => {
  it('exposes constructor options as readonly props', () => {
    const s = new TestPTYSession({
      id: 'local-1',
      command: '/bin/bash',
      cwd: '/home/me',
      cols: 120,
      rows: 40,
      pid: 99,
    });
    expect(s.id).toBe('local-1');
    expect(s.command).toBe('/bin/bash');
    expect(s.cwd).toBe('/home/me');
    expect(s.cols).toBe(120);
    expect(s.rows).toBe(40);
    expect(s.pid).toBe(99);
    expect(s.source).toBe('local');
    expect(s.isRunning).toBe(true);
    expect(s.exitCode).toBeNull();
    expect(s.isDisposed).toBe(false);
  });

  it('buffers output and emits output events', () => {
    const s = new TestPTYSession({ id: 's', command: 'bash' });
    const onOut = vi.fn();
    s.on('output', onOut);
    s.simulateOutput('hello');
    s.simulateOutput(Buffer.from('!'));
    expect(onOut).toHaveBeenCalledTimes(2);
    expect(s.getOutputBuffer()?.toString()).toBe('hello!');
  });

  it('resize emits only on change', () => {
    const s = new TestPTYSession({ id: 's', command: 'bash', cols: 80, rows: 24 });
    const onResize = vi.fn();
    s.on('resized', onResize);
    s.resize(80, 24);
    expect(onResize).not.toHaveBeenCalled();
    s.resize(100, 30);
    expect(onResize).toHaveBeenCalledWith(100, 30);
    expect(s.cols).toBe(100);
  });

  it('focus emits only on change', () => {
    const s = new TestPTYSession({ id: 's', command: 'bash' });
    const onFocus = vi.fn();
    s.on('focusChanged', onFocus);
    s.simulateFocus(false);
    expect(onFocus).not.toHaveBeenCalled();
    s.simulateFocus(true);
    expect(onFocus).toHaveBeenCalledWith(true);
    expect(s.isFocused).toBe(true);
  });

  it('kill marks exited and emits exit', () => {
    const s = new TestPTYSession({ id: 's', command: 'bash' });
    const onExit = vi.fn();
    s.on('exit', onExit);
    s.kill('SIGTERM');
    expect(s.isRunning).toBe(false);
    expect(s.exitCode).toBe(0);
    expect(onExit).toHaveBeenCalledWith(0, 'SIGTERM');
  });

  it('dispose clears buffer and is idempotent', () => {
    const s = new TestPTYSession({ id: 's', command: 'bash' });
    s.simulateOutput('x');
    const onDisp = vi.fn();
    s.on('disposed', onDisp);
    s.dispose();
    expect(s.isDisposed).toBe(true);
    expect(s.getOutputBuffer()).toBeNull();
    expect(onDisp).toHaveBeenCalledTimes(1);
    s.dispose();
    expect(onDisp).toHaveBeenCalledTimes(1);
  });

  it('toInfo serializes state', () => {
    const s = new TestPTYSession({ id: 's', command: 'zsh', cwd: '/' });
    const info = s.toInfo();
    expect(info).toMatchObject({
      id: 's',
      command: 'zsh',
      cwd: '/',
      isRunning: true,
      source: 'local',
    });
  });
});
