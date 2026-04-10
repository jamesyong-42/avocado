/**
 * Hook for terminal grid selection and settings management
 */

import { useState, useCallback } from 'react';
import type { TerminalInfo, TerminalSettings } from '@avocado/types';

export interface GridLayout {
  cols: number;
  rows: number;
}

export interface UseTerminalGridResult {
  selectedIds: string[];
  settings: Record<string, TerminalSettings>;
  gridLayout: GridLayout;
  getSelectedTerminals: (terminals: TerminalInfo[]) => TerminalInfo[];
  toggleSelection: (terminalId: string) => void;
  addToGrid: (terminalId: string) => boolean;
  removeFromGrid: (terminalId: string) => void;
  clearSelection: () => void;
  getSettings: (terminalId: string) => TerminalSettings;
  updateSettings: (terminalId: string, updates: Partial<TerminalSettings>) => void;
  resetSettings: (terminalId: string) => void;
  maxTerminals: number;
}

const MAX_TERMINALS = 9;
const DEFAULT_SETTINGS: TerminalSettings = { autoResize: true };

function calculateGridLayout(count: number): GridLayout {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count <= 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

export function useTerminalGrid(): UseTerminalGridResult {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<Record<string, TerminalSettings>>({});

  const toggleSelection = useCallback((terminalId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(terminalId)) return prev.filter((id) => id !== terminalId);
      if (prev.length >= MAX_TERMINALS) return prev;
      return [...prev, terminalId];
    });
  }, []);

  const addToGrid = useCallback((terminalId: string): boolean => {
    let added = false;
    setSelectedIds((prev) => {
      if (prev.includes(terminalId) || prev.length >= MAX_TERMINALS) return prev;
      added = true;
      return [...prev, terminalId];
    });
    return added;
  }, []);

  const removeFromGrid = useCallback((terminalId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== terminalId));
  }, []);

  const clearSelection = useCallback(() => { setSelectedIds([]); }, []);

  const getSettings = useCallback((terminalId: string): TerminalSettings => {
    return settings[terminalId] || DEFAULT_SETTINGS;
  }, [settings]);

  const updateSettings = useCallback((terminalId: string, updates: Partial<TerminalSettings>) => {
    setSettings((prev) => ({
      ...prev,
      [terminalId]: { ...(prev[terminalId] || DEFAULT_SETTINGS), ...updates },
    }));
  }, []);

  const resetSettings = useCallback((terminalId: string) => {
    setSettings((prev) => {
      const next = { ...prev };
      delete next[terminalId];
      return next;
    });
  }, []);

  const getSelectedTerminals = useCallback((terminals: TerminalInfo[]): TerminalInfo[] => {
    return terminals.filter((t) => selectedIds.includes(t.id));
  }, [selectedIds]);

  const gridLayout = calculateGridLayout(selectedIds.length);

  return {
    selectedIds,
    settings,
    gridLayout,
    getSelectedTerminals,
    toggleSelection,
    addToGrid,
    removeFromGrid,
    clearSelection,
    getSettings,
    updateSettings,
    resetSettings,
    maxTerminals: MAX_TERMINALS,
  };
}
