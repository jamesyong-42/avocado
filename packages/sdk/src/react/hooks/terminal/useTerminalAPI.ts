/**
 * Hook to check Terminal API availability via AvocadoProvider
 */

import { useState, useEffect } from 'react';
import { useAvocadoBackendOptional } from '../../context/AvocadoProvider';

export interface UseTerminalAPIResult {
  isAvailable: boolean | null;
  isLoading: boolean;
}

export function useTerminalAPI(): UseTerminalAPIResult {
  const backend = useAvocadoBackendOptional();
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setIsAvailable(!!backend?.terminal);
  }, [backend]);

  return {
    isAvailable,
    isLoading: isAvailable === null,
  };
}
