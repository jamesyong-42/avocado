/**
 * Hook for terminal management
 *
 * Uses useAvocadoBackend() instead of window.desktopAPI.
 * Note: The cross-device store integration (useCrossDeviceStore) is not included
 * since it was Electron-specific. Mode syncing must be handled by the consumer.
 */

import { useState, useEffect, useCallback, useRef, type JSX } from 'react';
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
    if (focusedTerminalRef.current === terminal.id) return;
    focusedTerminalRef.current = terminal.id;
    backend.terminal.setActive(terminal.id);
  }, [backend]);

  const handleTerminalBlur = useCallback((terminal: TerminalInfo) => {
    if (focusedTerminalRef.current === terminal.id) {
      focusedTerminalRef.current = null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const unsubscribeTerminalDestroyed = backend.terminal.onDestroyed?.(
      (terminalId: string, _sessionId: string) => {
        setTerminals((prev) => prev.filter((t) => t.id !== terminalId));
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
