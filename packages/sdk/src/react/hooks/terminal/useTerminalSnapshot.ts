/**
 * useTerminalSnapshot — poll a headless terminal's screen state.
 *
 * The data half of the old HeadlessTerminal component: fetches screen lines
 * and cursor position from the backend on an interval and exposes them as
 * plain state. Rendering is entirely the caller's.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAvocadoBackend } from '../../context/AvocadoProvider.js';

export interface TerminalSnapshot {
  lines: string[];
  /** Lines joined with newlines, for convenience. */
  content: string;
  cursorX: number;
  cursorY: number;
  lastUpdate: Date;
}

export interface UseTerminalSnapshotOptions {
  terminalId: string;
  /** Poll interval in ms (default 100); `0` disables polling. */
  refreshInterval?: number;
}

export interface UseTerminalSnapshotResult {
  snapshot: TerminalSnapshot;
  error: string | null;
  /** Fetch once immediately (also called automatically on the interval). */
  refresh: () => Promise<void>;
}

const EMPTY_SNAPSHOT: Omit<TerminalSnapshot, 'lastUpdate'> = {
  lines: [],
  content: '',
  cursorX: 0,
  cursorY: 0,
};

export function useTerminalSnapshot({
  terminalId,
  refreshInterval = 100,
}: UseTerminalSnapshotOptions): UseTerminalSnapshotResult {
  const backend = useAvocadoBackend();
  const [snapshot, setSnapshot] = useState<TerminalSnapshot>(() => ({
    ...EMPTY_SNAPSHOT,
    lastUpdate: new Date(),
  }));
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [linesResult, cursorResult] = await Promise.all([
        backend.terminal.getScreenLines?.(terminalId),
        backend.terminal.getCursorPosition?.(terminalId),
      ]);

      if (linesResult?.success && linesResult.lines) {
        const lines = linesResult.lines;
        setSnapshot({
          lines,
          content: lines.join('\n'),
          cursorX: cursorResult?.success ? cursorResult.position?.x ?? 0 : 0,
          cursorY: cursorResult?.success ? cursorResult.position?.y ?? 0 : 0,
          lastUpdate: new Date(),
        });
        setError(null);
      } else if (linesResult && !linesResult.success) {
        setError(linesResult.error || 'Failed to fetch content');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [terminalId, backend]);

  useEffect(() => {
    void refresh();
    if (refreshInterval > 0) {
      timerRef.current = setInterval(() => void refresh(), refreshInterval);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [refresh, refreshInterval]);

  return { snapshot, error, refresh };
}

export default useTerminalSnapshot;
