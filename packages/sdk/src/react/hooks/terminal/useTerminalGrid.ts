/**
 * Hook for terminal grid selection and settings management.
 *
 * Headless: owns which terminals are in the grid, per-terminal settings,
 * and a pluggable layout calculation. Rendering is entirely the caller's.
 */

import { useState, useCallback } from 'react';
import type { TerminalInfo, TerminalSettings } from '#types';

export interface GridLayout {
  cols: number;
  rows: number;
}

export interface UseTerminalGridOptions {
  /** Maximum terminals in the grid (default 9; `Infinity` for unbounded). */
  maxTerminals?: number;
  /** Layout algorithm (default: near-square, {@link defaultGridLayout}). */
  layout?: (count: number) => GridLayout;
  /** Settings applied to terminals without explicit settings (default `{ autoResize: true }`). */
  defaultSettings?: TerminalSettings;
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

const DEFAULT_MAX_TERMINALS = 9;
const DEFAULT_SETTINGS: TerminalSettings = { autoResize: true };

/** Near-square layout: cols = ⌈√count⌉, rows as needed. */
export function defaultGridLayout(count: number): GridLayout {
  if (count <= 1) return { cols: 1, rows: 1 };
  const cols = Math.ceil(Math.sqrt(count));
  return { cols, rows: Math.ceil(count / cols) };
}

export function useTerminalGrid({
  maxTerminals = DEFAULT_MAX_TERMINALS,
  layout = defaultGridLayout,
  defaultSettings = DEFAULT_SETTINGS,
}: UseTerminalGridOptions = {}): UseTerminalGridResult {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<Record<string, TerminalSettings>>({});

  const toggleSelection = useCallback((terminalId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(terminalId)) return prev.filter((id) => id !== terminalId);
      if (prev.length >= maxTerminals) return prev;
      return [...prev, terminalId];
    });
  }, [maxTerminals]);

  const addToGrid = useCallback((terminalId: string): boolean => {
    let added = false;
    setSelectedIds((prev) => {
      if (prev.includes(terminalId) || prev.length >= maxTerminals) return prev;
      added = true;
      return [...prev, terminalId];
    });
    return added;
  }, [maxTerminals]);

  const removeFromGrid = useCallback((terminalId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== terminalId));
  }, []);

  const clearSelection = useCallback(() => { setSelectedIds([]); }, []);

  const getSettings = useCallback((terminalId: string): TerminalSettings => {
    return settings[terminalId] || defaultSettings;
  }, [settings, defaultSettings]);

  const updateSettings = useCallback((terminalId: string, updates: Partial<TerminalSettings>) => {
    setSettings((prev) => ({
      ...prev,
      [terminalId]: { ...(prev[terminalId] || defaultSettings), ...updates },
    }));
  }, [defaultSettings]);

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

  const gridLayout = layout(selectedIds.length);

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
    maxTerminals,
  };
}
