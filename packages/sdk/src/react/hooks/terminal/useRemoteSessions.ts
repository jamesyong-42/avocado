/**
 * Hook for remote session discovery via PTYSyncStore.
 *
 * Consumes the optional `remoteSessions` slice of TerminalBackend.
 * Returns an empty list if the backend doesn't provide remote session support.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAvocadoBackendOptional } from '../../context/AvocadoProvider';

export interface RemoteSessionOffer {
  deviceId: string;
  deviceName: string;
  sessionId: string;
  command: string;
  cwd: string;
  cols: number;
  rows: number;
  pid: number;
}

export interface UseRemoteSessionsResult {
  remoteSessions: RemoteSessionOffer[];
  isAvailable: boolean;
  refresh: () => Promise<void>;
}

export function useRemoteSessions(): UseRemoteSessionsResult {
  const backend = useAvocadoBackendOptional();
  const [remoteSessions, setRemoteSessions] = useState<RemoteSessionOffer[]>([]);
  const isAvailable = !!backend?.remoteSessions;

  const refresh = useCallback(async () => {
    if (!backend?.remoteSessions) return;
    const offers = await backend.remoteSessions.list();
    setRemoteSessions(offers as RemoteSessionOffer[]);
  }, [backend]);

  useEffect(() => {
    if (!backend?.remoteSessions) return;

    // Initial fetch
    void refresh();

    // Subscribe to changes
    const unsubscribe = backend.remoteSessions.onChanged?.((offers) => {
      setRemoteSessions(offers as RemoteSessionOffer[]);
    });

    return () => {
      unsubscribe?.();
    };
  }, [backend, refresh]);

  return { remoteSessions, isAvailable, refresh };
}
