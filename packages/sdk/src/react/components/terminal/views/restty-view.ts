/**
 * ResttyTerminalView — TerminalView over the primary Restty API
 * (libghostty-vt WASM + WebGPU/WebGL2).
 *
 * I/O model:
 * - Keys: AvocadoPtyTransport (connected) → avocado PTY (no local echo)
 * - Display: avocado PTY output → Restty.sendInput(text, "pty")
 * - Resize: engine-driven only (transport.resize / fit); host-driven resizes
 *   use transport.withHostResizeSuppressed to avoid feedback loops
 */

import type {
  TerminalView,
  TerminalViewCreateOptions,
  TerminalViewLifecycleEvent,
  Unsubscribe,
} from './types.js';
import {
  AvocadoPtyTransport,
  createAvocadoPtyTransport,
} from './avocado-pty-transport.js';
import { bundledFontResttyInput, loadBundledMonoFont } from './bundled-font.js';

/** Minimal Restty instance surface we depend on. */
export interface ResttyInstance {
  sendInput(text: string, source?: string): void;
  resize(cols: number, rows: number): void;
  focus(): void;
  blur(): void;
  updateSize(): void;
  destroy(): void;
}

export type ResttyCtor = new (config: Record<string, unknown>) => ResttyInstance;

export type LoadRestty = () => Promise<ResttyCtor>;

const defaultLoadRestty: LoadRestty = async () => {
  try {
    const mod = await import('restty');
    const Restty = (mod as { Restty?: ResttyCtor }).Restty;
    if (!Restty) {
      throw new Error('restty package did not export Restty');
    }
    return Restty;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[avocado] Failed to load restty (engine: restty). Install peer dependency "restty" ` +
        `or use engine: "xterm". Underlying error: ${msg}`,
      { cause: err instanceof Error ? err : undefined }
    );
  }
};

function prepareHost(container: HTMLElement): void {
  container.replaceChildren();
  container.style.position = 'absolute';
  container.style.inset = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.overflow = 'hidden';
  container.style.minHeight = '0';
  container.style.minWidth = '0';
}

function afterLayout(): Promise<void> {
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
  return new Promise((resolve) => {
    raf(() => {
      raf(() => resolve());
    });
  });
}

export class ResttyTerminalView implements TerminalView {
  private readonly restty: ResttyInstance;
  private readonly transport: AvocadoPtyTransport;
  private readonly container: HTMLElement;
  private disposed = false;
  private _cols: number;
  private _rows: number;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly resizeListeners = new Set<(size: { cols: number; rows: number }) => void>();
  private readonly lifecycleListeners = new Set<(e: TerminalViewLifecycleEvent) => void>();

  private constructor(
    restty: ResttyInstance,
    transport: AvocadoPtyTransport,
    container: HTMLElement,
    cols: number,
    rows: number
  ) {
    this.restty = restty;
    this.transport = transport;
    this.container = container;
    this._cols = cols;
    this._rows = rows;
  }

  static async create(
    options: TerminalViewCreateOptions,
    load: LoadRestty = defaultLoadRestty
  ): Promise<ResttyTerminalView> {
    const {
      container,
      cols,
      rows,
      fontSize = 14,
    } = options;

    prepareHost(container);
    await afterLayout();

    let ResttyCtor: ResttyCtor;
    try {
      ResttyCtor = await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[avocado] Failed to load restty (engine: restty). Install peer dependency "restty" ` +
          `or use engine: "xterm". Underlying error: ${msg}`,
        { cause: err instanceof Error ? err : undefined }
      );
    }

    const viewRef: { current: ResttyTerminalView | null } = { current: null };

    const transport = createAvocadoPtyTransport({
      onKeyInput: (data) => {
        const view = viewRef.current;
        if (!view || view.disposed) return;
        for (const listener of view.dataListeners) {
          listener(data);
        }
      },
      onEngineResize: (c, r) => {
        const view = viewRef.current;
        if (!view || view.disposed) return;
        if (view._cols === c && view._rows === r) return;
        view._cols = c;
        view._rows = r;
        for (const listener of view.resizeListeners) {
          listener({ cols: c, rows: r });
        }
      },
      onLifecycle: (event) => {
        const view = viewRef.current;
        if (!view || view.disposed) return;
        for (const listener of view.lifecycleListeners) {
          listener(event);
        }
      },
    });

    // Connect before Restty mounts so first keystroke uses transport path.
    transport.connect({
      url: 'avocado://local',
      cols,
      rows,
      callbacks: {},
    });

    const fonts: unknown[] = [];
    const bundled = await loadBundledMonoFont();
    if (bundled) {
      fonts.push(bundledFontResttyInput(bundled));
    }
    // Local system faces as soft fallbacks after the bundled face.
    for (const family of ['Menlo', 'Monaco', 'SF Mono', 'Cascadia Mono', 'Consolas']) {
      fonts.push({ family, local: 'prefer' as const });
    }

    const restty = new ResttyCtor({
      root: container,
      surface: {
        paneStyles: true,
        createInitialPane: true,
        shortcuts: false,
        searchUi: false,
        defaultContextMenu: false,
      },
      terminal: {
        renderer: 'webgl2',
        fontSize,
        autoResize: true,
        showResizeOverlay: false,
        forwardTerminalReplies: false,
        fonts,
      },
      services: {
        ptyTransport: transport,
      },
    });

    // Host-driven initial size (suppress engine resize bounce).
    transport.withHostResizeSuppressed(() => {
      restty.resize(cols, rows);
      restty.updateSize();
    });

    const view = new ResttyTerminalView(restty, transport, container, cols, rows);
    viewRef.current = view;
    return view;
  }

  get cols(): number {
    return this._cols;
  }

  get rows(): number {
    return this._rows;
  }

  /** Expose transport for tests / advanced lifecycle (exit/error). */
  get ptyTransport(): AvocadoPtyTransport {
    return this.transport;
  }

  write(data: string | Uint8Array): void {
    if (this.disposed) return;
    const text =
      typeof data === 'string' ? data : new TextDecoder().decode(data);
    if (!text) return;
    this.restty.sendInput(text, 'pty');
  }

  /**
   * Host-driven resize: apply to restty without re-emitting onResize
   * (caller already owns the dimension state).
   */
  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    if (this._cols === cols && this._rows === rows) return;
    this._cols = cols;
    this._rows = rows;
    this.transport.withHostResizeSuppressed(() => {
      this.restty.resize(cols, rows);
    });
  }

  focus(): void {
    if (this.disposed) return;
    this.restty.focus();
  }

  blur(): void {
    if (this.disposed) return;
    this.restty.blur();
  }

  fit(): void {
    if (this.disposed) return;
    // Engine-driven: updateSize may call transport.resize → onResize.
    this.restty.updateSize();
  }

  onData(listener: (data: string) => void): Unsubscribe {
    if (this.disposed) return () => {};
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onResize(listener: (size: { cols: number; rows: number }) => void): Unsubscribe {
    if (this.disposed) return () => {};
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  onLifecycle(listener: (event: TerminalViewLifecycleEvent) => void): Unsubscribe {
    if (this.disposed) return () => {};
    this.lifecycleListeners.add(listener);
    return () => this.lifecycleListeners.delete(listener);
  }

  /** Forward PTY session exit into the transport lifecycle. */
  reportExit(code?: number): void {
    if (this.disposed) return;
    this.transport.reportExit(code);
  }

  reportError(message: string, errors?: string[]): void {
    if (this.disposed) return;
    this.transport.reportError(message, errors);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.dataListeners.clear();
    this.resizeListeners.clear();
    this.lifecycleListeners.clear();
    try {
      this.transport.disconnect();
      this.transport.destroy();
    } catch {
      /* ignore */
    }
    try {
      this.restty.destroy();
    } catch {
      /* ignore */
    }
    this.container.replaceChildren();
  }
}

export async function createResttyTerminalView(
  options: TerminalViewCreateOptions,
  load?: LoadRestty
): Promise<TerminalView> {
  return ResttyTerminalView.create(options, load);
}

export type LoadResttyXterm = LoadRestty;
export type ResttyXtermTerminalCtor = ResttyCtor;
export type ResttyXtermTerminal = ResttyInstance;
