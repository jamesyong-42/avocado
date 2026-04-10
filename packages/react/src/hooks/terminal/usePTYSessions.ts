/**
 * Hook for PTY session management
 *
 * Uses useAvocadoBackend() instead of window.desktopAPI.
 */

import { useState, useEffect, useCallback } from 'react';
import type { PtySession, CreateSessionOptions } from '@avocado/types';
import { useAvocadoBackend } from '../../context/AvocadoProvider';

export type SessionSourceFilter = 'local' | 'ipc' | 'remote' | 'all';

export interface UsePTYSessionsResult {
  sessions: PtySession[];
  selectedSessionId: string | null;
  selectedSession: PtySession | undefined;
  filteredSessions: PtySession[];
  sourceFilter: SessionSourceFilter;
  setSourceFilter: (filter: SessionSourceFilter) => void;
  selectSession: (sessionId: string | null) => void;
  createSession: (options: CreateSessionOptions) => Promise<string | null>;
  destroySession: (sessionId: string) => Promise<boolean>;
  resizeSession: (sessionId: string, cols: number, rows: number) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function usePTYSessions(): UsePTYSessionsResult {
  const backend = useAvocadoBackend();
  const [sessions, setSessions] = useState<PtySession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SessionSourceFilter>('all');

  const refresh = useCallback(async () => {
    const result = await backend.pty.list();
    if (result?.success && result.sessions) {
      setSessions(result.sessions as PtySession[]);
    }
  }, [backend]);

  const createSession = useCallback(async (options: CreateSessionOptions): Promise<string | null> => {
    const result = await backend.pty.create(options);
    if (result?.success && result.sessionId) {
      setSelectedSessionId(result.sessionId);
      await refresh();
      return result.sessionId;
    }
    return null;
  }, [backend, refresh]);

  const destroySession = useCallback(async (sessionId: string): Promise<boolean> => {
    const result = await backend.pty.destroy(sessionId);
    if (result?.success) {
      if (selectedSessionId === sessionId) setSelectedSessionId(null);
      await refresh();
      return true;
    }
    return false;
  }, [backend, selectedSessionId, refresh]);

  const resizeSession = useCallback(async (sessionId: string, cols: number, rows: number): Promise<boolean> => {
    const result = await backend.pty.resize(sessionId, cols, rows);
    return result?.success ?? false;
  }, [backend]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const unsubscribePtyExit = backend.pty.onExit(() => { refresh(); });
    const unsubscribeSessionDiscovered = backend.pty.onSessionDiscovered?.(() => { refresh(); });
    const unsubscribeSessionLost = backend.pty.onSessionLost?.(() => { refresh(); });

    return () => {
      unsubscribePtyExit();
      unsubscribeSessionDiscovered?.();
      unsubscribeSessionLost?.();
    };
  }, [backend, refresh]);

  const filteredSessions = sourceFilter === 'all'
    ? sessions
    : sourceFilter === 'remote'
      ? sessions.filter((s) => s.source === 'ipc' || s.source === 'ws')
      : sessions.filter((s) => s.source === sourceFilter);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  return {
    sessions,
    selectedSessionId,
    selectedSession,
    filteredSessions,
    sourceFilter,
    setSourceFilter,
    selectSession: setSelectedSessionId,
    createSession,
    destroySession,
    resizeSession,
    refresh,
  };
}
