/**
 * Hook to check Terminal API availability via AvocadoProvider
 */

import { useState, useEffect } from 'react';
import { useAvocadoBackend } from '../../context/AvocadoProvider';

export interface UseTerminalAPIResult {
  isAvailable: boolean | null;
  isLoading: boolean;
}

export function useTerminalAPI(): UseTerminalAPIResult {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  // If we got here, useAvocadoBackend() didn't throw, so backend exists
  try {
    const backend = useAvocadoBackend();
    useEffect(() => {
      setIsAvailable(!!backend?.terminal);
    }, [backend]);
  } catch {
    useEffect(() => {
      setIsAvailable(false);
    }, []);
  }

  return {
    isAvailable,
    isLoading: isAvailable === null,
  };
}
