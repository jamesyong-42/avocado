/**
 * TerminalView — engine-neutral terminal view contract.
 *
 * Engines (xterm, restty, …) implement this interface. Session wiring in
 * `useTerminalCore` depends only on this surface — never on xterm or restty
 * types. That keeps avocado's PTY/mesh stack independent of the renderer.
 */

/** Cleanup function returned from event subscriptions. */
export type Unsubscribe = () => void;

/** Stable engine ids for `createTerminalView` / `VirtualTerminal`. */
export type TerminalEngineId = 'xterm' | 'restty';

/** Minimal theme bag shared across engines (engines ignore unknown keys). */
export interface TerminalViewTheme {
  background?: string;
  foreground?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

export interface TerminalViewCreateOptions {
  /** DOM host the engine mounts into (must be attached when create resolves). */
  container: HTMLElement;
  cols: number;
  rows: number;
  fontSize?: number;
  fontFamily?: string;
  /** Treat LF as CRLF (IPC/UDS passive viewers). */
  convertEol?: boolean;
  cursorBlink?: boolean;
  /** Transparent cursor for passive/headless-ish UDS views. */
  cursorColor?: string;
  theme?: TerminalViewTheme;
}

/**
 * Lifecycle events from the view/transport (session attach, exit, errors).
 * Optional — engines that don't model a remote PTY may never emit these.
 */
export type TerminalViewLifecycleEvent =
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'error'; message: string; errors?: string[] }
  | { type: 'exit'; code?: number };

/**
 * Engine-neutral terminal view.
 *
 * Implementations must:
 * - Own all DOM/canvas resources for the terminal
 * - Be safe to dispose more than once
 * - Not call avocado backend APIs (push IO outward via onData/onResize only)
 *
 * Resize ownership:
 * - `resize(cols, rows)` is **host-driven**: apply size, do not re-emit `onResize`
 * - Engine auto-fit / restty autoResize emit **`onResize`** only when the engine
 *   measured a new size (engine-driven)
 */
export interface TerminalView {
  readonly cols: number;
  readonly rows: number;

  write(data: string | Uint8Array): void;
  /** Host-driven resize — must not emit onResize. */
  resize(cols: number, rows: number): void;
  focus(): void;
  blur(): void;
  /**
   * Best-effort fit to the host container (engine-driven).
   * May emit onResize if cols/rows change.
   */
  fit(): void;
  dispose(): void;

  onData(listener: (data: string) => void): Unsubscribe;
  /** Engine-driven size changes only. */
  onResize(listener: (size: { cols: number; rows: number }) => void): Unsubscribe;
  /** Optional session lifecycle (connect / disconnect / exit / error). */
  onLifecycle?(listener: (event: TerminalViewLifecycleEvent) => void): Unsubscribe;
}

/**
 * Factory for tests and alternate engines.
 * Production code uses {@link createTerminalView}.
 */
export type TerminalViewFactory = (
  engine: TerminalEngineId,
  options: TerminalViewCreateOptions
) => Promise<TerminalView>;
