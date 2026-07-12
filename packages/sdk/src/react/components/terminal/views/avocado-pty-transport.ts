/**
 * AvocadoPtyTransport — first-class restty `PtyTransport` that bridges
 * keystrokes/resize to avocado without local echo.
 *
 * Lifecycle:
 *   idle → connect() → connected → disconnect() → idle
 *   destroy() is terminal (no further connect).
 *
 * Display path is intentionally separate: avocado PTY output is pushed into
 * restty via `Restty.sendInput(text, "pty")`, not via `callbacks.onData`.
 * That keeps a single, explicit ownership boundary.
 *
 * @see https://github.com/wiedymi/restty (PtyTransport / custom-transport example)
 */

/** Mirrors restty's PtyResizeMeta (kept local so we don't hard-depend on restty types). */
export type AvocadoPtyResizeMeta = {
  widthPx?: number;
  heightPx?: number;
  cellW?: number;
  cellH?: number;
};

/** Mirrors restty's PtyCallbacks subset we use. */
export type AvocadoPtyCallbacks = {
  onConnect?: () => void;
  onDisconnect?: () => void;
  /** Unused for display; avocado drives output via Restty.sendInput(..., "pty"). */
  onData?: (data: string) => void;
  onStatus?: (shell: string) => void;
  onError?: (message: string, errors?: string[]) => void;
  onExit?: (code: number) => void;
};

export type AvocadoPtyConnectOptions = {
  url?: string;
  cols?: number;
  rows?: number;
  callbacks: AvocadoPtyCallbacks;
};

export type AvocadoPtyLifecycleState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closing'
  | 'destroyed';

export type AvocadoPtyLifecycleEvent =
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'error'; message: string; errors?: string[] }
  | { type: 'exit'; code?: number };

export type AvocadoPtyTransportHandlers = {
  /** User keystrokes / paste from restty → avocado backend. */
  onKeyInput: (data: string) => void;
  /**
   * Engine-driven resize (restty autoResize / fit).
   * Host-driven resizes must not loop back through this.
   */
  onEngineResize: (cols: number, rows: number, meta?: AvocadoPtyResizeMeta) => void;
  /** Optional lifecycle observer (tests / UI). */
  onLifecycle?: (event: AvocadoPtyLifecycleEvent) => void;
};

/**
 * Restty-compatible PtyTransport implementation.
 *
 * When `isConnected()` is true, restty's `sendKeyInput` forwards keys here
 * and does **not** local-echo into WASM — preventing double characters when
 * the real shell also echoes.
 */
export class AvocadoPtyTransport {
  private state: AvocadoPtyLifecycleState = 'idle';
  private callbacks: AvocadoPtyCallbacks | null = null;
  private readonly handlers: AvocadoPtyTransportHandlers;
  /** Suppress transport.resize → onEngineResize while applying a host-driven resize. */
  private suppressEngineResize = false;

  constructor(handlers: AvocadoPtyTransportHandlers) {
    this.handlers = handlers;
  }

  get lifecycleState(): AvocadoPtyLifecycleState {
    return this.state;
  }

  connect(options: AvocadoPtyConnectOptions): void {
    if (this.state === 'destroyed') {
      throw new Error('[AvocadoPtyTransport] cannot connect after destroy()');
    }
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }
    this.state = 'connecting';
    this.callbacks = options.callbacks;
    this.state = 'connected';
    this.callbacks.onConnect?.();
    this.handlers.onLifecycle?.({ type: 'connected' });
  }

  disconnect(): void {
    if (this.state !== 'connected' && this.state !== 'connecting') {
      return;
    }
    this.state = 'closing';
    const cb = this.callbacks;
    this.callbacks = null;
    this.state = 'idle';
    cb?.onDisconnect?.();
    this.handlers.onLifecycle?.({ type: 'disconnected' });
  }

  sendInput(data: string): boolean {
    if (this.state !== 'connected') return false;
    if (!data) return true;
    this.handlers.onKeyInput(data);
    return true;
  }

  resize(cols: number, rows: number, meta?: AvocadoPtyResizeMeta): boolean {
    if (this.state !== 'connected') return false;
    if (this.suppressEngineResize) return true;
    this.handlers.onEngineResize(cols, rows, meta);
    return true;
  }

  /**
   * Run `fn` while transport.resize notifications are ignored.
   * Used when avocado applies a host-driven cols/rows change into restty so
   * restty's internal resize callback does not bounce back to avocado.
   */
  withHostResizeSuppressed<T>(fn: () => T): T {
    this.suppressEngineResize = true;
    try {
      return fn();
    } finally {
      this.suppressEngineResize = false;
    }
  }

  isConnected(): boolean {
    // Report connected only when lifecycle says so — but restty's
    // sendKeyInput needs a transport that is connected to avoid local echo.
    // We connect during ResttyTerminalView.create before user interaction.
    return this.state === 'connected';
  }

  /** Signal session error to restty callbacks + lifecycle listeners. */
  reportError(message: string, errors?: string[]): void {
    this.callbacks?.onError?.(message, errors);
    this.handlers.onLifecycle?.({ type: 'error', message, errors });
  }

  /** Signal PTY exit (session ended). */
  reportExit(code?: number): void {
    this.callbacks?.onExit?.(code ?? 0);
    this.handlers.onLifecycle?.({ type: 'exit', code });
    this.disconnect();
  }

  destroy(): void {
    if (this.state === 'destroyed') return;
    if (this.state === 'connected' || this.state === 'connecting') {
      this.disconnect();
    }
    this.state = 'destroyed';
    this.callbacks = null;
  }
}

export function createAvocadoPtyTransport(
  handlers: AvocadoPtyTransportHandlers
): AvocadoPtyTransport {
  return new AvocadoPtyTransport(handlers);
}
