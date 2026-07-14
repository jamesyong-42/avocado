/**
 * defaultGridLayout — the near-square layout used by useTerminalGrid.
 *
 * Locks two contracts: parity with the legacy 1–9 lookup table it replaced,
 * and sane growth beyond the old 9-terminal cap.
 */

import { describe, it, expect } from 'vitest';
import { defaultGridLayout } from '../../src/react/hooks/terminal/useTerminalGrid.js';

describe('defaultGridLayout', () => {
  it('matches the legacy lookup table for 1–9 terminals', () => {
    const legacy = (count: number) => {
      if (count <= 1) return { cols: 1, rows: 1 };
      if (count <= 2) return { cols: 2, rows: 1 };
      if (count <= 4) return { cols: 2, rows: 2 };
      if (count <= 6) return { cols: 3, rows: 2 };
      return { cols: 3, rows: 3 };
    };
    for (let count = 0; count <= 9; count++) {
      expect(defaultGridLayout(count)).toEqual(legacy(count));
    }
  });

  it('keeps growing near-square past the old 9 cap', () => {
    expect(defaultGridLayout(10)).toEqual({ cols: 4, rows: 3 });
    expect(defaultGridLayout(16)).toEqual({ cols: 4, rows: 4 });
    expect(defaultGridLayout(17)).toEqual({ cols: 5, rows: 4 });
  });

  it('always provides at least count cells', () => {
    for (let count = 1; count <= 100; count++) {
      const { cols, rows } = defaultGridLayout(count);
      expect(cols * rows).toBeGreaterThanOrEqual(count);
      // Never more than one spare row.
      expect(cols * (rows - 1)).toBeLessThan(count);
    }
  });
});
