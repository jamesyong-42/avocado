import { describe, it, expect, vi } from 'vitest';
import {
  LocalPTYSession,
  buildInteractivePtyEnv,
  type IPty,
} from '../../src/node-pty/local-pty-session.js';

function createFakePty(overrides: Partial<IPty> = {}): IPty & {
  dataCb?: (data: string) => void;
  exitCb?: (e: { exitCode: number; signal?: number }) => void;
} {
  const fake: IPty & {
    dataCb?: (data: string) => void;
    exitCb?: (e: { exitCode: number; signal?: number }) => void;
  } = {
    pid: 1234,
    cols: 80,
    rows: 24,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb) => {
      fake.dataCb = cb;
      return { dispose: vi.fn() };
    },
    onExit: (cb) => {
      fake.exitCb = cb;
      return { dispose: vi.fn() };
    },
    ...overrides,
  };
  return fake;
}

describe('LocalPTYSession', () => {
  it('wraps IPty and forwards write/resize/kill', () => {
    const pty = createFakePty();
    const session = new LocalPTYSession(pty, {
      command: '/bin/bash',
      cwd: '/tmp',
    });
    expect(session.pid).toBe(1234);
    expect(session.source).toBe('local');
    expect(session.id).toMatch(/^local-/);

    session.write('echo hi');
    expect(pty.write).toHaveBeenCalledWith('echo hi');
    session.write(Buffer.from('x'));
    expect(pty.write).toHaveBeenCalledWith('x');

    session.resize(100, 40);
    expect(pty.resize).toHaveBeenCalledWith(100, 40);

    session.kill('SIGTERM');
    expect(pty.kill).toHaveBeenCalled();
    session.dispose();
  });

  it('emits output from onData and exits via onExit', () => {
    const pty = createFakePty();
    const session = new LocalPTYSession(pty, { command: 'bash', id: 'local-fixed' });
    const onOut = vi.fn();
    const onExit = vi.fn();
    session.on('output', onOut);
    session.on('exit', onExit);

    pty.dataCb?.('hello');
    expect(onOut).toHaveBeenCalled();
    expect(session.getOutputBuffer()?.toString()).toContain('hello');

    pty.exitCb?.({ exitCode: 0 });
    expect(session.isRunning).toBe(false);
    expect(onExit).toHaveBeenCalled();
    session.dispose();
  });

  it('spawn factory uses provided spawn function and truecolor env', () => {
    const pty = createFakePty({ pid: 9, cols: 100, rows: 50 });
    const spawn = vi.fn(() => pty);
    const session = LocalPTYSession.spawn(
      spawn,
      { command: 'bash', args: ['-l'], cwd: '/work', cols: 100, rows: 50 },
      { command: 'bash' }
    );
    expect(spawn).toHaveBeenCalled();
    const cfg = spawn.mock.calls[0]![0];
    expect(cfg.env.COLORTERM).toBe('truecolor');
    expect(cfg.env.TERM).toBe('xterm-256color');
    expect(cfg.env.FORCE_COLOR).toBe('3');
    expect(cfg.name).toBe('xterm-256color');
    expect(session.pid).toBe(9);
    expect(session.cols).toBe(100);
    session.dispose();
  });
});

describe('buildInteractivePtyEnv', () => {
  it('advertises truecolor and strips NO_COLOR from parent', () => {
    const env = buildInteractivePtyEnv({
      PATH: '/usr/bin',
      NO_COLOR: '1',
      NODE_DISABLE_COLORS: '1',
      TERM: 'dumb',
      FORCE_COLOR: '0',
    });
    expect(env.COLORTERM).toBe('truecolor');
    expect(env.TERM).toBe('xterm-256color');
    expect(env.FORCE_COLOR).toBe('3');
    expect(env.NO_COLOR).toBeUndefined();
    expect(env.NODE_DISABLE_COLORS).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
  });
});

