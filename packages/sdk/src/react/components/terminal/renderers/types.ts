/**
 * Shared types for terminal core state/actions (engine-agnostic UI layer).
 */

import type { RefObject } from 'react';
import type { TerminalEngineId } from '../views/types.js';

export type { TerminalEngineId };

/** Core terminal state exposed by useTerminalCore */
export interface TerminalCoreState {
  containerRef: RefObject<HTMLDivElement | null>;
  isReady: boolean;
  dimensions: { cols: number; rows: number };
  fixedDimensions: { width: number; height: number } | null;
  engine: TerminalEngineId;
}

/** Actions available from useTerminalCore */
export interface TerminalCoreActions {
  focus: () => void;
  blur: () => void;
  fit: () => void;
  write: (data: string | Uint8Array) => void;
  resize: (cols: number, rows: number) => void;
}
