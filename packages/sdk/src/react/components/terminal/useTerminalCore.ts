/**
 * useTerminalCore — engine-agnostic terminal session wiring.
 *
 * Owns:
 *   - creating a TerminalView (xterm | restty) via injectable factory
 *   - TerminalBackend PTY output → view.write
 *   - view.onData → backend.pty.write
 *   - fit / resize → backend.terminal.resize when active
 *
 * Does not own engine-specific DOM details beyond a host container ref.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { TerminalCoreState, TerminalCoreActions } from './renderers/types.js';
import type {
  TerminalEngineId,
  TerminalView,
  TerminalViewFactory,
} from './views/types.js';
import { defaultTerminalViewFactory } from './views/create-terminal-view.js';
import { useAvocadoBackend } from '../../context/AvocadoProvider.js';

/**
 * Decode base64 to UTF-8 bytes properly.
 */
function decodeBase64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  return Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
}

/**
 * Check if data is a terminal response sequence that should be suppressed
 */
function isTerminalResponse(data: string): boolean {
  if (/^\x1b\[\?[\d;]*c$/.test(data)) return true;
  if (/^\x1b\[>[\d;]*c$/.test(data)) return true;
  if (/^\x1b\[\d+;\d+R$/.test(data)) return true;
  if (/^\x1b\[\??\d+;\d+\$y$/.test(data)) return true;
  if (/^\x1b\[\d+n$/.test(data)) return true;
  if (/^\x1b\]/.test(data)) return true;
  if (/^\x1bP/.test(data)) return true;
  return false;
}

export interface UseTerminalCoreOptions {
  sessionId: string;
  terminalId: string;
  cols?: number;
  rows?: number;
  isActive?: boolean;
  autoResize?: boolean;
  onResize?: (cols: number, rows: number) => void;
  onInput?: (data: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  fontSize?: number;
  fontFamily?: string;
  convertEol?: boolean;
  suppressTerminalResponses?: boolean;
  /** Terminal rendering engine (default: xterm). */
  engine?: TerminalEngineId;
  /**
   * Injectable view factory (tests / custom engines).
   * Defaults to {@link defaultTerminalViewFactory}.
   */
  createView?: TerminalViewFactory;
}

export interface UseTerminalCoreResult {
  state: TerminalCoreState;
  actions: TerminalCoreActions;
  /** Last engine create error, if any. */
  error: Error | null;
}

export function useTerminalCore({
  sessionId,
  terminalId,
  cols = 80,
  rows = 24,
  isActive = false,
  autoResize = true,
  onResize,
  onInput,
  onFocus,
  onBlur,
  fontSize = 14,
  fontFamily = 'Menlo, Monaco, "Courier New", monospace',
  convertEol = false,
  suppressTerminalResponses = false,
  engine = 'xterm',
  createView = defaultTerminalViewFactory,
}: UseTerminalCoreOptions): UseTerminalCoreResult {
  const backend = useAvocadoBackend();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<TerminalView | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);

  const [isReady, setIsReady] = useState(false);
  const [dimensions, setDimensions] = useState({ cols, rows });
  const [fixedDimensions, setFixedDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const isActiveRef = useRef(isActive);
  const autoResizeRef = useRef(autoResize);
  const prevIsActiveRef = useRef(isActive);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);
  const onResizeRef = useRef(onResize);
  const onInputRef = useRef(onInput);
  const suppressRef = useRef(suppressTerminalResponses);

  isActiveRef.current = isActive;
  autoResizeRef.current = autoResize;
  onFocusRef.current = onFocus;
  onBlurRef.current = onBlur;
  onResizeRef.current = onResize;
  onInputRef.current = onInput;
  suppressRef.current = suppressTerminalResponses;

  const sendResizeToPty = useCallback(
    (newCols: number, newRows: number) => {
      if (!isActiveRef.current) return;
      backend.terminal.resize(terminalId, newCols, newRows);
    },
    [terminalId, backend]
  );

  /**
   * Engine-driven fit only. PTY resize ownership is **single-direction**:
   * `view.onResize` → backend. Host-driven `view.resize()` must not re-emit
   * onResize (engines suppress), so this path never double-fires with host props.
   */
  const fitAndResize = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const prevCols = view.cols;
    const prevRows = view.rows;
    view.fit();
    // UI dimensions: onResize also setDimensions; this covers engines that
    // update cols/rows in fit() without a separate emit race.
    if (view.cols !== prevCols || view.rows !== prevRows) {
      setDimensions({ cols: view.cols, rows: view.rows });
    }
  }, []);

  // Handle isActive change
  useEffect(() => {
    const wasActive = prevIsActiveRef.current;
    prevIsActiveRef.current = isActive;

    if (isActive && !wasActive && autoResize && viewRef.current) {
      setTimeout(() => fitAndResize(), 0);
    }

    if (!isActive && wasActive && viewRef.current) {
      viewRef.current.blur();
    }
  }, [isActive, autoResize, fitAndResize]);

  // Apply external dimension changes
  useEffect(() => {
    if (!viewRef.current) return;
    if (autoResize && isActive) return;
    if (viewRef.current.cols === cols && viewRef.current.rows === rows) return;
    viewRef.current.resize(cols, rows);
    setDimensions({ cols, rows });
  }, [cols, rows, autoResize, isActive]);

  // Create / dispose terminal view when identity or engine changes
  useEffect(() => {
    let cancelled = false;

    setIsReady(false);
    setError(null);

    const isUdsTerminal = convertEol;
    const cursorBlink = isUdsTerminal ? false : true;
    const cursorColor = isUdsTerminal ? 'transparent' : undefined;

    (async () => {
      try {
        // Wait for layout so the host has non-zero size before engine mount
        // (critical for restty canvas + xterm FitAddon).
        const raf =
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (cb: FrameRequestCallback) =>
                setTimeout(() => cb(Date.now()), 0) as unknown as number;
        await new Promise<void>((r) => raf(() => raf(() => r())));
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) {
          throw new Error('[avocado] Terminal host container is not mounted');
        }

        const view = await createView(engine, {
          container,
          cols,
          rows,
          fontSize,
          fontFamily,
          convertEol,
          cursorBlink,
          cursorColor,
        });
        if (cancelled) {
          view.dispose();
          return;
        }

        viewRef.current = view;

        const unsubData = view.onData((data) => {
          if (suppressRef.current) {
            if (isTerminalResponse(data)) return;
            if (data === '\x1b[I' || data === '\x1b[O') return;
          }
          backend.pty.write(sessionId, data);
          onInputRef.current?.(data);
        });

        // Engine-driven resize only (fit / restty autoResize / transport.resize).
        const unsubResize = view.onResize(({ cols: c, rows: r }) => {
          setDimensions({ cols: c, rows: r });
          onResizeRef.current?.(c, r);
          sendResizeToPty(c, r);
        });

        const unsubLifecycle =
          view.onLifecycle?.((event) => {
            if (event.type === 'error') {
              console.warn('[useTerminalCore] view lifecycle error:', event.message);
              setError(new Error(event.message));
            } else if (event.type === 'exit') {
              console.info('[useTerminalCore] view session exit', event.code);
            }
          }) ?? (() => {});

        unsubscribersRef.current = [unsubData, unsubResize, unsubLifecycle];

        if (isUdsTerminal) {
          view.write('\x1b[?25l');
        }

        if (autoResizeRef.current) {
          view.fit();
          setDimensions({ cols: view.cols, rows: view.rows });
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
          }
          const resizeObserver = new ResizeObserver(() => {
            if (viewRef.current) fitAndResize();
          });
          resizeObserver.observe(container);
          resizeObserverRef.current = resizeObserver;
          // Initial size → PTY (host intent at attach).
          if (isActiveRef.current) {
            sendResizeToPty(view.cols, view.rows);
          }
        } else {
          const rect = container.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            setFixedDimensions({
              width: Math.ceil(rect.width),
              height: Math.ceil(rect.height),
            });
          } else {
            const charWidth = fontSize * 0.6;
            const lineHeight = fontSize * 1.2;
            setFixedDimensions({
              width: Math.ceil(cols * charWidth) + 20,
              height: Math.ceil(rows * lineHeight) + 10,
            });
          }
        }

        // Focus after a tick so engine IME/textarea exists.
        requestAnimationFrame(() => {
          if (!cancelled) view.focus();
        });
        setIsReady(true);
      } catch (err) {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        console.error('[useTerminalCore] failed to create view', e);
        setError(e);
        setIsReady(false);
      }
    })();

    return () => {
      cancelled = true;
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      for (const u of unsubscribersRef.current) u();
      unsubscribersRef.current = [];
      if (viewRef.current) {
        viewRef.current.dispose();
        viewRef.current = null;
      }
      setIsReady(false);
    };
    // Intentionally stable on session/terminal/engine — option changes remount via keys at call site if needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, terminalId, engine, createView]);

  // Handle autoResize toggle
  useEffect(() => {
    if (!viewRef.current || !containerRef.current) return;

    if (autoResize) {
      setFixedDimensions(null);
      fitAndResize();

      if (!resizeObserverRef.current) {
        const resizeObserver = new ResizeObserver(() => {
          if (viewRef.current) fitAndResize();
        });
        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;
      }
    } else {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      const rect = containerRef.current.getBoundingClientRect();
      setFixedDimensions({
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      });
    }
  }, [autoResize, fitAndResize]);

  // Subscribe to PTY output
  useEffect(() => {
    const unsubscribe = backend.pty.onOutput(
      (outputTerminalId: string, _outputSessionId: string, base64Data: string) => {
        if (outputTerminalId === terminalId && viewRef.current) {
          try {
            const data = decodeBase64ToBytes(base64Data);
            viewRef.current.write(data);
          } catch {
            // Failed to write to terminal
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [terminalId, backend]);

  const actions: TerminalCoreActions = useMemo(
    () => ({
      focus: () => viewRef.current?.focus(),
      blur: () => viewRef.current?.blur(),
      fit: () => viewRef.current?.fit(),
      write: (data: string | Uint8Array) => viewRef.current?.write(data),
      resize: (newCols: number, newRows: number) =>
        viewRef.current?.resize(newCols, newRows),
    }),
    []
  );

  const state: TerminalCoreState = useMemo(
    () => ({
      containerRef,
      isReady,
      dimensions,
      fixedDimensions,
      engine,
    }),
    [isReady, dimensions, fixedDimensions, engine]
  );

  return { state, actions, error };
}

export default useTerminalCore;
