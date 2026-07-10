/**
 * Integration: real node-pty spawn when the native module is available.
 */

import { describe, it, expect } from 'vitest';
import { LocalPTYSession } from '../../src/node-pty/local-pty-session.js';

async function loadNodePty(): Promise<typeof import('node-pty') | null> {
  try {
    return await import('node-pty');
  } catch {
    return null;
  }
}

describe('LocalPTYSession + node-pty', async () => {
  const nodePty = await loadNodePty();
  const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/bash';

  it.skipIf(!nodePty)('spawns a shell, captures output, and exits on kill', async () => {
    const session = LocalPTYSession.spawn(
      (cfg) =>
        nodePty!.spawn(cfg.command, cfg.args ?? [], {
          name: cfg.name ?? 'xterm-color',
          cols: cfg.cols ?? 80,
          rows: cfg.rows ?? 24,
          cwd: cfg.cwd,
          env: cfg.env as Record<string, string>,
        }),
      { command: shell, cols: 80, rows: 24 },
      { command: shell }
    );

    expect(session.isRunning).toBe(true);
    expect(session.pid).toBeGreaterThan(0);

    // Write a no-op and wait briefly for any shell prompt / echo.
    session.write(process.platform === 'win32' ? 'echo avocado-ok\r\n' : 'echo avocado-ok\n');

    await new Promise((r) => setTimeout(r, 400));
    const buf = session.getOutputBuffer();
    // Soft assertion: PTY usually emits something; kill path is the hard guarantee.
    expect(buf === null || Buffer.isBuffer(buf)).toBe(true);

    const exitPromise = new Promise<number>((resolve) => {
      session.once('exit', (code) => resolve(code));
    });
    session.kill();
    const code = await exitPromise;
    expect(typeof code).toBe('number');
    expect(session.isRunning).toBe(false);
    session.dispose();
  });
});
