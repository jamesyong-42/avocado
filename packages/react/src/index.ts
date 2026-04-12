/**
 * @avocado/react - Barrel export
 *
 * React terminal components, hooks, and context for the avocado terminal library.
 */

// Context
export { AvocadoProvider, useAvocadoBackend } from './context/AvocadoProvider';
export type { AvocadoProviderProps } from './context/AvocadoProvider';

// Components
export { VirtualTerminal } from './components/terminal/VirtualTerminal';
export type { VirtualTerminalProps } from './components/terminal/VirtualTerminal';

export { HeadlessTerminal } from './components/terminal/HeadlessTerminal';
export type { HeadlessTerminalProps } from './components/terminal/HeadlessTerminal';

export { TerminalCard } from './components/terminal/TerminalCard';
export type { TerminalCardProps } from './components/terminal/TerminalCard';

export { TerminalGrid } from './components/terminal/TerminalGrid';
export type { TerminalGridProps, GridLayout } from './components/terminal/TerminalGrid';

export { useTerminalCore } from './components/terminal/useTerminalCore';
export type { UseTerminalCoreOptions, UseTerminalCoreResult } from './components/terminal/useTerminalCore';

// Renderers
export { DefaultRenderer } from './components/terminal/renderers/DefaultRenderer';
export { CRTEffect, CRTEffectImpl } from './components/terminal/renderers/webgl/CRTEffect';
export { TerminalPlane } from './components/terminal/renderers/webgl/TerminalPlane';
export { useTextureSync, findXtermCanvas } from './components/terminal/renderers/webgl/useTextureSync';
export { getPreset, mergeWithPreset, getPresetNames, PRESETS } from './components/terminal/renderers/presets';

// Renderer types
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
} from './components/terminal/renderers/types';

// Hooks
export { usePTYSessions } from './hooks/terminal/usePTYSessions';
export type { UsePTYSessionsResult, SessionSourceFilter } from './hooks/terminal/usePTYSessions';

export { useTerminals } from './hooks/terminal/useTerminals';
export type { UseTerminalsResult } from './hooks/terminal/useTerminals';

export { useTerminalGrid } from './hooks/terminal/useTerminalGrid';
export type { UseTerminalGridResult } from './hooks/terminal/useTerminalGrid';

export { useTerminalAPI } from './hooks/terminal/useTerminalAPI';
export type { UseTerminalAPIResult } from './hooks/terminal/useTerminalAPI';

export { useRemoteSessions } from './hooks/terminal/useRemoteSessions';
export type { UseRemoteSessionsResult, RemoteSessionOffer } from './hooks/terminal/useRemoteSessions';
