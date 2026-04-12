// Components
export { VirtualTerminal } from './VirtualTerminal';
export type { VirtualTerminalProps } from './VirtualTerminal';

export { HeadlessTerminal } from './HeadlessTerminal';
export type { HeadlessTerminalProps } from './HeadlessTerminal';

export { TerminalCard } from './TerminalCard';
export type { TerminalCardProps } from './TerminalCard';

export { TerminalGrid } from './TerminalGrid';
export type { TerminalGridProps, GridLayout } from './TerminalGrid';

// Hooks
export { useTerminalCore } from './useTerminalCore';
export type { UseTerminalCoreOptions, UseTerminalCoreResult } from './useTerminalCore';

// Renderers
export {
  DefaultRenderer,
  getPreset,
  mergeWithPreset,
  getPresetNames,
  PRESETS,
  CRTEffect,
  CRTEffectImpl,
  TerminalPlane,
  useTextureSync,
  findXtermCanvas,
} from './renderers/index';
export type {
  CRTOptions,
  BloomOptions,
  RendererOptions,
  CRTPreset,
  RendererType,
  TerminalCoreState,
  TerminalCoreActions,
  TerminalRendererProps,
  VirtualTerminalRendererProps,
} from './renderers/index';
