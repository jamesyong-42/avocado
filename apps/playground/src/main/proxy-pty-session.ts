/**
 * ProxyPTYSession — `IPTYSession` implementation over an `IPTYTransport`.
 *
 * Every remote session that surfaces in `PTYSessionManager` ends up wrapped
 * in one of these. Operations (`write`, `resize`, `kill`) are forwarded to
 * the transport; incoming events (`output`, `resized`, `sessionEnded`,
 * `focusChanged`) are translated back into the base class's internal state
 * via `pushOutput` / `setSize` / `setExited` / `setFocus`.
 *
 * Dependency boundaries (Risk 5):
 *
 *  - Imports from `@avocado/types` only: `BasePTYSession`, `IPTYSession`,
 *    `IPTYTransport`, and the announce/metadata types.
 *  - Does NOT import from `@avocado/core` — the `ProxySessionFactory`
 *    signature is duplicated inline so this file stays types-only on the
 *    package graph.
 *
 * Ported from vibe-ctl's proxy-pty-session.ts (Phase D in the plan).
 */

import { BasePTYSession } from '@avocado/types';
import type {
  IPTYSession,
  IPTYTransport,
  SessionSource,
  IPCSessionMetadata,
  WSSessionMetadata,
} from '@avocado/types';

// ─── Options ───────────────────────────────────────────────────────────────

/**
 * Factory options — mirrors the shape that `PTYSessionManager` passes to
 * a `ProxySessionFactory` when creating a proxy session.
 */
export interface ProxyPTYSessionOptions {
  /** Namespaced session ID (unique within this manager). */
  id: string;
  /** Source type — 'ipc' or 'ws' for proxies. */
  source: SessionSource;
  /** The un-namespaced session ID on the remote side. */
  remoteSessionId: string;
  pid: number;
  command: string;
  cwd: string;
  cols: number;
  rows: number;
  metadata: IPCSessionMetadata | WSSessionMetadata;
}

// ─── Proxy PTY session ─────────────────────────────────────────────────────

export class ProxyPTYSession extends BasePTYSession implements IPTYSession {
  private readonly transport: IPTYTransport;
  private readonly remoteSessionId: string;

  // Bound listeners kept so we can detach on dispose.
  private readonly onOutput: (sessionId: string, data: Buffer) => void;
  private readonly onResized: (
    sessionId: string,
    cols: number,
    rows: number
  ) => void;
  private readonly onSessionEnded: (
    sessionId: string,
    exitCode: number
  ) => void;
  private readonly onFocusChanged: (
    sessionId: string,
    focused: boolean
  ) => void;

  constructor(transport: IPTYTransport, options: ProxyPTYSessionOptions) {
    super({
      id: options.id,
      source: options.source,
      pid: options.pid,
      command: options.command,
      cwd: options.cwd,
      cols: options.cols,
      rows: options.rows,
      metadata: options.metadata,
      isRunning: true,
    });

    this.transport = transport;
    this.remoteSessionId = options.remoteSessionId;

    this.onOutput = (sessionId, data): void => {
      if (sessionId !== this.remoteSessionId) return;
      this.pushOutput(data);
    };
    this.onResized = (sessionId, cols, rows): void => {
      if (sessionId !== this.remoteSessionId) return;
      // `setSize` is protected on BasePTYSession.
      (this as unknown as { setSize(c: number, r: number): void }).setSize(
        cols,
        rows
      );
    };
    this.onSessionEnded = (sessionId, exitCode): void => {
      if (sessionId !== this.remoteSessionId) return;
      (
        this as unknown as {
          setExited(code: number, signal?: string): void;
        }
      ).setExited(exitCode);
    };
    this.onFocusChanged = (sessionId, focused): void => {
      if (sessionId !== this.remoteSessionId) return;
      (
        this as unknown as { setFocus(focused: boolean): void }
      ).setFocus(focused);
    };

    transport.on('output', this.onOutput);
    transport.on('resized', this.onResized);
    transport.on('sessionEnded', this.onSessionEnded);
    transport.on('focusChanged', this.onFocusChanged);
  }

  // ─── IPTYSession operations (remote) ─────────────────────────────────────

  override write(data: string | Buffer): void {
    if (this._disposed || !this._isRunning) return;
    this.transport.sendInput(this.remoteSessionId, data);
  }

  override resize(cols: number, rows: number): void {
    if (this._disposed || !this._isRunning) return;
    if (this._cols === cols && this._rows === rows) return;
    this.transport.sendResize(this.remoteSessionId, cols, rows);
    // We don't update local cols/rows immediately — we wait for the remote
    // `resized` event, which will feed back in via onResized.
  }

  override kill(signal?: string): void {
    if (this._disposed || !this._isRunning) return;
    this.transport.sendKill(this.remoteSessionId, signal);
  }

  // ─── Disposal ────────────────────────────────────────────────────────────

  override dispose(): void {
    if (this._disposed) return;
    // Detach listeners before calling super.dispose() (which clears all
    // listeners on the session itself, not the transport).
    this.transport.off('output', this.onOutput);
    this.transport.off('resized', this.onResized);
    this.transport.off('sessionEnded', this.onSessionEnded);
    this.transport.off('focusChanged', this.onFocusChanged);
    super.dispose();
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

/**
 * Factory suitable for
 * `PTYSessionManager.setProxySessionFactory(createProxyPTYSession)`.
 *
 * We avoid importing `ProxySessionFactory` from `@avocado/core` (Risk 5) —
 * the shape is duplicated here and structural TypeScript checks the
 * compatibility at the call site when `AvocadoManager` wires it up.
 */
export function createProxyPTYSession(
  transport: IPTYTransport,
  options: ProxyPTYSessionOptions
): IPTYSession {
  return new ProxyPTYSession(transport, options);
}
