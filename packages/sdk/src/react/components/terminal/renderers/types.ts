/**
 * Terminal Renderer Types
 *
 * Type definitions for the swappable renderer architecture.
 */

import type { Terminal } from 'xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { RefObject } from 'react';

/** CRT shader effect options */
export interface CRTOptions {
  scanlineIntensity?: number;
  curvature?: number;
  chromaticAberration?: number;
  vignetteIntensity?: number;
  phosphorGlow?: number;
  flickerIntensity?: number;
}

/** Bloom postprocessing options */
export interface BloomOptions {
  intensity?: number;
  luminanceThreshold?: number;
  luminanceSmoothing?: number;
  kernelSize?: number;
}

/** Combined renderer options */
export interface RendererOptions {
  crt?: CRTOptions;
  bloom?: BloomOptions;
}

/** CRT effect preset names */
export type CRTPreset = 'none' | 'subtle' | 'classic' | 'heavy';

/** Renderer type selector */
export type RendererType = 'default' | 'webgl';

/** Core terminal state exposed by useTerminalCore */
export interface TerminalCoreState {
  terminalRef: RefObject<Terminal | null>;
  fitAddonRef: RefObject<FitAddon | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  isReady: boolean;
  dimensions: { cols: number; rows: number };
  fixedDimensions: { width: number; height: number } | null;
}

/** Actions available from useTerminalCore */
export interface TerminalCoreActions {
  focus: () => void;
  blur: () => void;
  fit: () => void;
  write: (data: string | Uint8Array) => void;
  resize: (cols: number, rows: number) => void;
}

/** Props passed to renderer components */
export interface TerminalRendererProps {
  core: TerminalCoreState;
  actions: TerminalCoreActions;
  autoResize: boolean;
  onClick?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  crtPreset?: CRTPreset;
  rendererOptions?: RendererOptions;
}

/** Extended props for VirtualTerminal with renderer support */
export interface VirtualTerminalRendererProps {
  renderer?: RendererType;
  crtPreset?: CRTPreset;
  rendererOptions?: RendererOptions;
}
