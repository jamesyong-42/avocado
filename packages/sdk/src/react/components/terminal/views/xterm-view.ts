/**
 * XtermTerminalView — TerminalView adapter over xterm.js + FitAddon.
 *
 * xterm is loaded lazily so restty-only code paths (and unit tests) never
 * pull the browser-only xterm bundle into Node.
 */

import type {
  TerminalView,
  TerminalViewCreateOptions,
  Unsubscribe,
} from './types.js';

const DEFAULT_THEME = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  selectionBackground: '#3b3b5c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

/** Structural xterm Terminal surface we rely on. */
interface XtermLike {
  cols: number;
  rows: number;
  textarea?: HTMLTextAreaElement | null;
  write(data: string | Uint8Array): void;
  resize(cols: number, rows: number): void;
  focus(): void;
  blur(): void;
  dispose(): void;
  open(parent: HTMLElement): void;
  loadAddon(addon: { fit?: () => void }): void;
  onData(listener: (data: string) => void): { dispose: () => void };
  onResize(listener: (size: { cols: number; rows: number }) => void): { dispose: () => void };
}

interface FitAddonLike {
  fit(): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activate?(terminal: any): void;
  dispose?(): void;
}

export class XtermTerminalView implements TerminalView {
  private readonly term: XtermLike;
  private readonly fitAddon: FitAddonLike;
  private disposed = false;
  private ignoreNextResizeEmit = false;
  private readonly dataDisposables: Array<{ dispose: () => void }> = [];
  private readonly resizeDisposables: Array<{ dispose: () => void }> = [];

  private constructor(term: XtermLike, fitAddon: FitAddonLike) {
    this.term = term;
    this.fitAddon = fitAddon;
  }

  static async create(options: TerminalViewCreateOptions): Promise<XtermTerminalView> {
    const {
      container,
      cols,
      rows,
      fontSize = 14,
      fontFamily = 'Menlo, Monaco, "Courier New", monospace',
      convertEol = false,
      cursorBlink = true,
      cursorColor,
      theme,
    } = options;

    // Ensure helper textarea / screen layers are styled (without this CSS the
    // xterm textarea is a visible box at top-left of the host).
    await import('xterm/css/xterm.css');

    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('xterm'),
      import('@xterm/addon-fit'),
    ]);

    // Own this host completely; clear prior engine DOM.
    container.replaceChildren();
    container.style.position = 'absolute';
    container.style.inset = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.overflow = 'hidden';

    const mergedTheme = { ...DEFAULT_THEME, ...theme };
    if (cursorColor !== undefined) {
      mergedTheme.cursor = cursorColor;
    }

    const term = new Terminal({
      cols,
      rows,
      fontSize,
      fontFamily,
      cursorBlink,
      cursorStyle: 'block',
      convertEol,
      scrollback: 10_000,
      theme: mergedTheme,
    }) as unknown as XtermLike;

    const fitAddon = new FitAddon() as unknown as FitAddonLike;
    term.loadAddon(fitAddon as never);
    term.open(container);

    return new XtermTerminalView(term, fitAddon);
  }

  get cols(): number {
    return this.term.cols;
  }

  get rows(): number {
    return this.term.rows;
  }

  write(data: string | Uint8Array): void {
    if (this.disposed) return;
    this.term.write(data);
  }

  /**
   * Host-driven resize — does not re-fire onResize (caller owns state).
   */
  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    if (this.term.cols === cols && this.term.rows === rows) return;
    // xterm fires onResize from resize(); temporarily ignore.
    this.ignoreNextResizeEmit = true;
    this.term.resize(cols, rows);
  }

  focus(): void {
    if (this.disposed) return;
    this.term.focus();
  }

  blur(): void {
    if (this.disposed) return;
    this.term.blur();
  }

  fit(): void {
    if (this.disposed) return;
    // Engine-driven: allow onResize emit from resulting term.resize.
    this.fitAddon.fit();
  }

  onData(listener: (data: string) => void): Unsubscribe {
    if (this.disposed) return () => {};
    const d = this.term.onData(listener);
    this.dataDisposables.push(d);
    return () => d.dispose();
  }

  onResize(listener: (size: { cols: number; rows: number }) => void): Unsubscribe {
    if (this.disposed) return () => {};
    const d = this.term.onResize((size) => {
      if (this.ignoreNextResizeEmit) {
        this.ignoreNextResizeEmit = false;
        return;
      }
      listener(size);
    });
    this.resizeDisposables.push(d);
    return () => d.dispose();
  }

  get textarea(): HTMLTextAreaElement | null {
    return this.term.textarea ?? null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of this.dataDisposables) d.dispose();
    for (const d of this.resizeDisposables) d.dispose();
    this.dataDisposables.length = 0;
    this.resizeDisposables.length = 0;
    this.term.dispose();
  }
}

export async function createXtermTerminalView(
  options: TerminalViewCreateOptions
): Promise<TerminalView> {
  return XtermTerminalView.create(options);
}
