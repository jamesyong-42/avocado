/**
 * Hook for terminal management
 *
 * Uses useAvocadoBackend() instead of window.desktopAPI.
 * Note: The cross-device store integration (useCrossDeviceStore) is not included
 * since it was Electron-specific. Mode syncing must be handled by the consumer.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TerminalInfo, TerminalMode, TerminalType, CreateTerminalOptions, PtySession } from '@avocado/types';
import { useAvocadoBackend } from '../../context/AvocadoProvider';

export interface UseTerminalsResult {
  terminals: TerminalInfo[];
  getTerminalsForSession: (sessionId: string) => TerminalInfo[];
  createTerminal: (sessionId: string, type: TerminalType, options: CreateTerminalOptions, session?: PtySession) => Promise<string | null>;
  destroyTerminal: (terminalId: string) => Promise<boolean>;
  resizeTerminal: (terminalId: string, cols: number, rows: number) => Promise<boolean>;
  setActive: (terminalId: string) => Promise<boolean>;
  updateTerminalState: (terminalId: string, updates: Partial<TerminalInfo>) => void;
  refresh: () => Promise<void>;
  focusedTerminalId: string | null;
  handleTerminalFocus: (terminal: TerminalInfo) => void;
  handleTerminalBlur: (terminal: TerminalInfo) => void;
}

export function useTerminals(): UseTerminalsResult {
  const backend = useAvocadoBackend();
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const focusedTerminalRef = useRef<string | null>(null);
  const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const result = await backend.terminal.list();
    if (result?.success && result.terminals) {
      setTerminals(result.terminals as TerminalInfo[]);
    }
  }, [backend]);

  const createTerminal = useCallback(async (
    sessionId: string,
    type: TerminalType,
    options: CreateTerminalOptions,
    _session?: PtySession
  ): Promise<string | null> => {
    const result = type === 'headless'
      ? await backend.terminal.createHeadless(sessionId, options)
      : await backend.terminal.createVirtual(sessionId, options);

    if (result?.success && result.terminalId) {
      await refresh();
      return result.terminalId;
    }
    return null;
  }, [backend, refresh]);

  const destroyTerminal = useCallback(async (terminalId: string): Promise<boolean> => {
    const result = await backend.terminal.destroy(terminalId);
    if (result?.success) {
      await refresh();
      return true;
    }
    return false;
  }, [backend, refresh]);

  const resizeTerminal = useCallback(async (terminalId: string, cols: number, rows: number): Promise<boolean> => {
    const result = await backend.terminal.resize(terminalId, cols, rows);
    if (result?.success) {
      await refresh();
      return true;
    }
    return false;
  }, [backend, refresh]);

  const setActive = useCallback(async (terminalId: string): Promise<boolean> => {
    const result = await backend.terminal.setActive(terminalId);
    return result?.success ?? false;
  }, [backend]);

  const updateTerminalState = useCallback((terminalId: string, updates: Partial<TerminalInfo>) => {
    setTerminals((prev) =>
      prev.map((t) => (t.id === terminalId ? { ...t, ...updates } : t))
    );
  }, []);

  const getTerminalsForSession = useCallback((sessionId: string): TerminalInfo[] => {
    return terminals.filter((t) => t.sessionId === sessionId);
  }, [terminals]);

  const handleTerminalFocus = useCallback((terminal: TerminalInfo) => {
    // Guard: skip if already focused and active
    if (focusedTerminalRef.current === terminal.id && terminal.mode === 'active') return;

    // Clear any pending debounce
    if (focusDebounceRef.current) {
      clearTimeout(focusDebounceRef.current);
    }

    focusedTerminalRef.current = terminal.id;

    // Debounce 100ms to prevent rapid switching
    focusDebounceRef.current = setTimeout(() => {
      // Tell the backend to set this terminal as active
      backend.terminal.setActive(terminal.id);

      // Optimistic local state update: focused terminal becomes active,
      // other terminals in the same session become passive
      setTerminals((prev) =>
        prev.map((t) => {
          if (t.sessionId !== terminal.sessionId) return t;
          if (t.id === terminal.id) {
            return t.mode === 'active' ? t : { ...t, mode: 'active' as const };
          }
          return t.mode === 'passive' ? t : { ...t, mode: 'passive' as const };
        })
      );
    }, 100);
  }, [backend]);

  const handleTerminalBlur = useCallback((_terminal: TerminalInfo) => {
    // Don't clear focus on blur — the next focus event will handle it.
    // This matches the source behavior where blur doesn't set mode to passive.
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const unsubscribeTerminalDestroyed = backend.terminal.onDestroyed?.(
      (terminalId: string, _sessionId: string) => {
        setTerminals((prev) => prev.filter((t) => t.id !== terminalId));
      }
    );

    const unsubscribeModeChanged = backend.terminal.onModeChanged?.(
      (data: { terminalId: string; sessionId: string; mode: string }) => {
        setTerminals((prev) =>
          prev.map((t) =>
            t.id === data.terminalId
              ? { ...t, mode: data.mode as TerminalMode }
              : t
          )
        );
      }
    );

    const unsubscribeSessionResized = backend.pty.onSessionResized?.(
      (sessionId: string, cols: number, rows: number) => {
        setTerminals((prev) =>
          prev.map((t) => (t.sessionId === sessionId ? { ...t, cols, rows } : t))
        );
      }
    );

    return () => {
      unsubscribeTerminalDestroyed?.();
      unsubscribeModeChanged?.();
      unsubscribeSessionResized?.();
    };
  }, [backend]);

  return {
    terminals,
    getTerminalsForSession,
    createTerminal,
    destroyTerminal,
    resizeTerminal,
    setActive,
    updateTerminalState,
    refresh,
    focusedTerminalId: focusedTerminalRef.current,
    handleTerminalFocus,
    handleTerminalBlur,
  };
}
