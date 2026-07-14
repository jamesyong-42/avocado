/**
 * TerminalHost — minimal local-only PTY host for the Ghostty showcase.
 *
 * The local slice of the playground's AvocadoManager: an SDK
 * `PTYSessionManager` + `TerminalService` with node-pty spawning. No mesh,
 * no IPC socket, no headless xterm mirror — one virtual terminal per
 * session, always active (Ghostty's model: every split owns its PTY).
 */

import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import * as nodePty from 'node-pty';

import {
  createPTYSessionManager,
  createTerminalService,
  type PTYSessionManager,
  type TerminalService,
} from '@vibecook/avocado-sdk';
import {
  LocalPTYSession,
  type IPty,
  type PTYSpawnFunction,
} from '@vibecook/avocado-sdk/node-pty';

import type { IPCPtySession, IPCTerminalInfo } from '@shared/ipc';

export const SHELL_COMMAND =
  process.platform === 'win32'
    ? (process.env['COMSPEC'] ?? 'cmd.exe')
    : (process.env['SHELL'] ?? '/bin/bash');

// Login shell on macOS, matching Ghostty / Terminal.app behavior.
const SHELL_ARGS = process.platform === 'darwin' ? ['-l'] : [];

export interface TerminalHostEvents {
  terminalOutput: (evt: { terminalId: string; sessionId: string; data: string }) => void;
  ptyExit: (sessionId: string, exitCode: number) => void;
}

export declare interface TerminalHost {
  on<E extends keyof TerminalHostEvents>(event: E, listener: TerminalHostEvents[E]): this;
  emit<E extends keyof TerminalHostEvents>(
    event: E,
    ...args: Parameters<TerminalHostEvents[E]>
  ): boolean;
}

export class TerminalHost extends EventEmitter {
  private readonly sessionManager: PTYSessionManager;
  private readonly terminalService: TerminalService;
  private readonly spawnFn: PTYSpawnFunction;

  constructor() {
    super();
    this.sessionManager = createPTYSessionManager();
    this.terminalService = createTerminalService(this.sessionManager);

    this.spawnFn = (config): IPty => {
      const pty = nodePty.spawn(config.command, config.args ?? [], {
        cwd: config.cwd ?? process.cwd(),
        env: config.env as NodeJS.ProcessEnv,
        cols: config.cols ?? 80,
        rows: config.rows ?? 24,
        name: config.name ?? 'xterm-color',
      });
      // node-pty's IPty is a structural superset of avocado's minimal IPty.
      return pty as unknown as IPty;
    };

    // Route output through the terminal service so each event carries the
    // terminalId — useTerminalCore in the renderer matches on terminalId.
    this.terminalService.on('terminalOutput', (evt) => {
      this.emit('terminalOutput', evt);
    });
    this.sessionManager.on('exit', (evt) => {
      this.emit('ptyExit', evt.sessionId, evt.exitCode);
    });
  }

  // ─── Sessions ────────────────────────────────────────────────────────────

  createSession(opts: { cwd?: string; cols: number; rows: number }): { sessionId: string } {
    const cwd = opts.cwd || homedir();
    const session = LocalPTYSession.spawn(
      this.spawnFn,
      {
        command: SHELL_COMMAND,
        args: SHELL_ARGS,
        cwd,
        cols: opts.cols,
        rows: opts.rows,
        env: {
          COLORTERM: 'truecolor',
          FORCE_COLOR: '3',
          TERM: 'xterm-256color',
        },
      },
      { command: SHELL_COMMAND, cwd }
    );
    this.sessionManager.registerSession(session);
    return { sessionId: session.id };
  }

  destroySession(sessionId: string): boolean {
    return this.sessionManager.kill(sessionId);
  }

  write(sessionId: string, data: string): void {
    this.sessionManager.write(sessionId, data);
  }

  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    return this.sessionManager.resize(sessionId, cols, rows);
  }

  listSessions(): IPCPtySession[] {
    return this.sessionManager.getSessions().map((s) => ({
      id: s.id,
      source: s.source,
      command: s.command,
      cwd: s.cwd,
      createdAt: s.startedAt.getTime(),
      pid: s.pid,
      cols: s.cols,
      rows: s.rows,
      isRunning: s.isRunning,
      exitCode: s.exitCode ?? null,
    }));
  }

  // ─── Terminals ───────────────────────────────────────────────────────────

  createVirtualTerminal(
    sessionId: string,
    options: { cols: number; rows: number; mode: string }
  ): string {
    return this.terminalService.createVirtualTerminal(sessionId, {
      cols: options.cols,
      rows: options.rows,
      mode: options.mode === 'passive' ? 'passive' : 'active',
    });
  }

  destroyTerminal(terminalId: string): void {
    this.terminalService.destroyTerminal(terminalId);
  }

  listTerminals(): IPCTerminalInfo[] {
    return this.terminalService.getAllTerminals().map((t) => ({
      id: t.id,
      sessionId: t.sessionId,
      type: t.type,
      mode: t.mode,
      cols: t.cols,
      rows: t.rows,
      createdAt: t.createdAt,
    }));
  }

  resizeTerminal(terminalId: string, cols: number, rows: number): boolean {
    return this.terminalService.resize(terminalId, cols, rows);
  }

  setActiveTerminal(terminalId: string): void {
    this.terminalService.setActive(terminalId);
  }

  dispose(): void {
    try {
      this.terminalService.shutdown();
    } catch {
      /* best effort */
    }
    try {
      this.sessionManager.dispose();
    } catch {
      /* best effort */
    }
  }
}
