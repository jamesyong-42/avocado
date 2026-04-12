/**
 * AvocadoProvider - React context for the TerminalBackend
 *
 * Replaces all window.desktopAPI references. Consumers provide their own
 * TerminalBackend implementation (Electron IPC, WebSocket, REST, etc.).
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { TerminalBackend } from '#types';

export const AvocadoContext = createContext<TerminalBackend | null>(null);

export interface AvocadoProviderProps {
  backend: TerminalBackend;
  children: ReactNode;
}

export function AvocadoProvider({ backend, children }: AvocadoProviderProps) {
  return (
    <AvocadoContext.Provider value={backend}>
      {children}
    </AvocadoContext.Provider>
  );
}

/**
 * Hook to access the TerminalBackend from context.
 * Throws if used outside <AvocadoProvider>.
 */
export function useAvocadoBackend(): TerminalBackend {
  const backend = useContext(AvocadoContext);
  if (!backend) {
    throw new Error('useAvocadoBackend must be used within an <AvocadoProvider>');
  }
  return backend;
}

/**
 * Hook to access the TerminalBackend from context, returning null if no
 * <AvocadoProvider> is present. Use this when the caller needs to detect
 * availability without throwing.
 */
export function useAvocadoBackendOptional(): TerminalBackend | null {
  return useContext(AvocadoContext);
}

export default AvocadoProvider;
