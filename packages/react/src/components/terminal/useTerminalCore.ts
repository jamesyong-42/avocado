/**
 * useTerminalCore Hook
 *
 * Encapsulates all xterm.js terminal logic including initialization,
 * PTY communication, and resize handling. Uses useAvocadoBackend()
 * instead of window.desktopAPI.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { TerminalCoreState, TerminalCoreActions } from './renderers/types';
import { useAvocadoBackend } from '../../context/AvocadoProvider';

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
  onRender?: () => void;
  useWebGLRenderer?: boolean;
}

export interface UseTerminalCoreResult {
  state: TerminalCoreState;
  actions: TerminalCoreActions;
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
  onRender,
  useWebGLRenderer = false,
}: UseTerminalCoreOptions): UseTerminalCoreResult {
  const backend = useAvocadoBackend();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [dimensions, setDimensions] = useState({ cols, rows });
  const [fixedDimensions, setFixedDimensions] = useState<{ width: number; height: number } | null>(null);

  const isActiveRef = useRef(isActive);
  const autoResizeRef = useRef(autoResize);
  const prevIsActiveRef = useRef(isActive);
  const onRenderRef = useRef(onRender);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);

  isActiveRef.current = isActive;
  autoResizeRef.current = autoResize;
  onRenderRef.current = onRender;
  onFocusRef.current = onFocus;
  onBlurRef.current = onBlur;

  const sendResizeToPty = useCallback(
    (newCols: number, newRows: number, _reason: string) => {
      if (!isActiveRef.current) return;
      backend.terminal.resize(terminalId, newCols, newRows);
    },
    [terminalId, backend]
  );

  const fitAndResize = useCallback(
    (reason: string) => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      fitAddonRef.current.fit();
      const newCols = terminalRef.current.cols;
      const newRows = terminalRef.current.rows;
      setDimensions({ cols: newCols, rows: newRows });
      onResize?.(newCols, newRows);
      sendResizeToPty(newCols, newRows, reason);
    },
    [onResize, sendResizeToPty]
  );

  // Handle isActive change
  useEffect(() => {
    const wasActive = prevIsActiveRef.current;
    prevIsActiveRef.current = isActive;

    if (isActive && !wasActive && autoResize && terminalRef.current && fitAddonRef.current) {
      setTimeout(() => fitAndResize('activation'), 0);
    }

    if (!isActive && wasActive && terminalRef.current) {
      terminalRef.current.blur();
    }
  }, [isActive, autoResize, fitAndResize]);

  // Apply external dimension changes
  useEffect(() => {
    if (!terminalRef.current) return;
    if (autoResize && isActive) return;
    if (terminalRef.current.cols === cols && terminalRef.current.rows === rows) return;
    terminalRef.current.resize(cols, rows);
    setDimensions({ cols, rows });
  }, [cols, rows, autoResize, isActive]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    let initTimer: ReturnType<typeof setTimeout> | null = null;

    initTimer = setTimeout(() => {
      if (!containerRef.current || terminalRef.current) return;

      const isUdsTerminal = convertEol;
      const effectiveCursorBlink = isUdsTerminal ? false : true;
      const cursorColor = isUdsTerminal ? 'transparent' : '#c0caf5';

      const term = new Terminal({
        cols,
        rows,
        fontSize,
        fontFamily,
        cursorBlink: effectiveCursorBlink,
        cursorStyle: 'block',
        convertEol,
        scrollback: 10000,
        theme: {
          background: '#1a1b26',
          foreground: '#c0caf5',
          cursor: cursorColor,
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
        },
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current!);

      if (useWebGLRenderer && typeof document !== 'undefined') {
        import('@xterm/addon-webgl')
          .then(({ WebglAddon }) => {
            try {
              const webglAddon = new WebglAddon();
              webglAddon.onContextLoss(() => webglAddon.dispose());
              term.loadAddon(webglAddon);
            } catch {
              // WebGL addon failed to load
            }
          })
          .catch(() => {
            // Failed to import WebGL addon
          });
      }

      if (isUdsTerminal) {
        term.write('\x1b[?25l');
      }

      terminalRef.current = term;
      fitAddonRef.current = fit;

      const renderDisposable = term.onWriteParsed(() => {
        onRenderRef.current?.();
      });

      if (autoResize) {
        fit.fit();
        const initialCols = term.cols;
        const initialRows = term.rows;
        setDimensions({ cols: initialCols, rows: initialRows });

        const resizeObserver = new ResizeObserver(() => {
          if (fitAddonRef.current && terminalRef.current) {
            fitAndResize('container-resize');
          }
        });
        resizeObserver.observe(containerRef.current!);
        resizeObserverRef.current = resizeObserver;

        if (isActiveRef.current) {
          sendResizeToPty(initialCols, initialRows, 'init');
        }
      } else {
        requestAnimationFrame(() => {
          if (!containerRef.current) return;
          const viewport = containerRef.current.querySelector('.xterm-viewport');
          if (viewport) {
            const rect = viewport.getBoundingClientRect();
            setFixedDimensions({ width: Math.ceil(rect.width) + 2, height: Math.ceil(rect.height) + 2 });
          } else {
            const charWidth = fontSize * 0.6;
            const lineHeight = fontSize * 1.2;
            setFixedDimensions({ width: Math.ceil(cols * charWidth) + 20, height: Math.ceil(rows * lineHeight) + 10 });
          }
        });
      }

      // Handle user input - use backend instead of window.desktopAPI
      term.onData((data) => {
        if (suppressTerminalResponses) {
          if (isTerminalResponse(data)) return;
          if (data === '\x1b[I' || data === '\x1b[O') return;
        }
        backend.pty.write(sessionId, data);
        onInput?.(data);
      });

      term.onResize(({ cols: newCols, rows: newRows }) => {
        setDimensions({ cols: newCols, rows: newRows });
        onResize?.(newCols, newRows);
      });

      // Wire xterm's native focus/blur to the callbacks. This is critical
      // because xterm's internal textarea captures DOM focus events before
      // they reach the container div's onFocusCapture.
      term.textarea?.addEventListener('focus', () => {
        onFocusRef.current?.();
      });
      term.textarea?.addEventListener('blur', () => {
        onBlurRef.current?.();
      });

      term.focus();
      setIsReady(true);

      return () => {
        renderDisposable.dispose();
      };
    }, 0);

    return () => {
      if (initTimer) clearTimeout(initTimer);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      }
      setIsReady(false);
    };
  }, [sessionId, terminalId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle autoResize toggle
  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current || !containerRef.current) return;

    if (autoResize) {
      setFixedDimensions(null);
      fitAndResize('autoResize-enabled');

      if (!resizeObserverRef.current) {
        const resizeObserver = new ResizeObserver(() => {
          if (fitAddonRef.current && terminalRef.current) {
            fitAndResize('container-resize');
          }
        });
        resizeObserver.observe(containerRef.current);
        resizeObserverRef.current = resizeObserver;
      }
    } else {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      const viewport = containerRef.current.querySelector('.xterm-viewport');
      if (viewport) {
        const rect = viewport.getBoundingClientRect();
        setFixedDimensions({ width: Math.ceil(rect.width) + 2, height: Math.ceil(rect.height) + 2 });
      }
    }
  }, [autoResize, fitAndResize]);

  // Subscribe to PTY output - use backend instead of window.desktopAPI
  useEffect(() => {
    const unsubscribe = backend.pty.onOutput(
      (outputTerminalId: string, _outputSessionId: string, base64Data: string) => {
        if (outputTerminalId === terminalId && terminalRef.current) {
          try {
            const data = decodeBase64ToBytes(base64Data);
            terminalRef.current.write(data);
          } catch {
            // Failed to write to terminal
          }
        }
      }
    );

    return () => { unsubscribe(); };
  }, [terminalId, backend]);

  const actions: TerminalCoreActions = useMemo(
    () => ({
      focus: () => terminalRef.current?.focus(),
      blur: () => terminalRef.current?.blur(),
      fit: () => fitAddonRef.current?.fit(),
      write: (data: string | Uint8Array) => terminalRef.current?.write(data),
      resize: (newCols: number, newRows: number) => terminalRef.current?.resize(newCols, newRows),
    }),
    []
  );

  const state: TerminalCoreState = useMemo(
    () => ({ terminalRef, fitAddonRef, containerRef, isReady, dimensions, fixedDimensions }),
    [isReady, dimensions, fixedDimensions]
  );

  return { state, actions };
}

export default useTerminalCore;
