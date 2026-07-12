import { describe, it, expect, vi } from 'vitest';
import {
  LocalPTYSession,
  buildInteractivePtyEnv,
  type IPty,
} from '../../src/node-pty/local-pty-session.js';

function createFakePty(overrides: Partial<IPty> = {}): IPty & {
  dataCb?: (data: string | Buffer) => void;
  exitCb?: (e: { exitCode: number; signal?: number }) => void;
} {
  const fake: IPty & {
    dataCb?: (data: string | Buffer) => void;
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
    // Buffers pass through byte-exact — no .toString() coercion to a string.
    session.write(Buffer.from('x'));
    expect(pty.write).toHaveBeenCalledWith(Buffer.from('x'));

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

  it('delivers byte-exact Buffer output for invalid UTF-8 from onData', () => {
    const pty = createFakePty();
    const session = new LocalPTYSession(pty, { command: 'bash' });
    const chunks: Buffer[] = [];
    session.on('output', (data: Buffer) => chunks.push(data));

    // 0xff 0xfe 0x80 is not valid UTF-8 — a utf8 round-trip would collapse it
    // to U+FFFD replacement chars and lose the original bytes.
    const invalid = Buffer.from([0xff, 0xfe, 0x80]);
    pty.dataCb?.(invalid);

    expect(chunks).toHaveLength(1);
    expect(Buffer.compare(chunks[0]!, invalid)).toBe(0);
    session.dispose();
  });

  it('writes a Buffer to the pty without utf8 mangling', () => {
    const pty = createFakePty();
    const session = new LocalPTYSession(pty, { command: 'bash' });

    // ESC [ M + high byte — a binary-ish sequence a .toString() would corrupt.
    const raw = Buffer.from([0x1b, 0x5b, 0x4d, 0x20, 0xff]);
    session.write(raw);

    const writeMock = vi.mocked(pty.write);
    expect(writeMock).toHaveBeenCalledTimes(1);
    const arg = writeMock.mock.calls[0]![0];
    expect(Buffer.isBuffer(arg)).toBe(true);
    expect(Buffer.compare(arg as Buffer, raw)).toBe(0);
    session.dispose();
  });

  it('accepts a string-mode (node-pty default) IPty without an unknown-cast', () => {
    // node-pty's default export types onData/write with `string` only. This
    // mirrors that shape and assigns it *directly* to the widened IPty — no
    // `as unknown` escape hatch like the playground's pty-spawner uses — so the
    // assignment is genuinely type-checked. It proves the variance direction
    // still holds: `string` is assignable to `string | Buffer`, and node-pty's
    // string-only onData callback stays assignable to the widened callback.
    interface StringModePty {
      readonly pid: number;
      readonly cols: number;
      readonly rows: number;
      write(data: string): void;
      resize(cols: number, rows: number): void;
      kill(signal?: string): void;
      onData: (callback: (data: string) => void) => { dispose: () => void };
      onExit: (
        callback: (exit: { exitCode: number; signal?: number }) => void
      ) => { dispose: () => void };
    }
    const stringMode = createFakePty() as unknown as StringModePty;
    // Load-bearing line: a compile-time-checked assignment (not `as unknown`).
    const widened: IPty = stringMode;
    expect(widened.pid).toBe(1234);
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
      CLICOLOR: '0',
    });
    expect(env.COLORTERM).toBe('truecolor');
    expect(env.TERM).toBe('xterm-256color');
    expect(env.FORCE_COLOR).toBe('3');
    expect(env.CLICOLOR).toBe('1');
    expect(env.CLICOLOR_FORCE).toBe('1');
    expect(env.NO_COLOR).toBeUndefined();
    expect(env.NODE_DISABLE_COLORS).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
  });

  it('cannot be downgraded by overrides', () => {
    const env = buildInteractivePtyEnv(
      {},
      { COLORTERM: 'no', FORCE_COLOR: '0', TERM: 'dumb', NO_COLOR: '1' }
    );
    expect(env.COLORTERM).toBe('truecolor');
    expect(env.FORCE_COLOR).toBe('3');
    expect(env.TERM).toBe('xterm-256color');
    expect(env.NO_COLOR).toBeUndefined();
  });
});

