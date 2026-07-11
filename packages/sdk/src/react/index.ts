/**
 * #react - Barrel export
 *
 * React terminal components, hooks, and context for the avocado terminal library.
 */

// Context
export { AvocadoProvider, useAvocadoBackend } from './context/AvocadoProvider.js';
export type { AvocadoProviderProps } from './context/AvocadoProvider.js';

// Components
export { VirtualTerminal } from './components/terminal/VirtualTerminal.js';
export type { VirtualTerminalProps } from './components/terminal/VirtualTerminal.js';

export { HeadlessTerminal } from './components/terminal/HeadlessTerminal.js';
export type { HeadlessTerminalProps } from './components/terminal/HeadlessTerminal.js';

export { TerminalCard } from './components/terminal/TerminalCard.js';
export type { TerminalCardProps } from './components/terminal/TerminalCard.js';

export { TerminalGrid } from './components/terminal/TerminalGrid.js';
export type { TerminalGridProps, GridLayout } from './components/terminal/TerminalGrid.js';

export { useTerminalCore } from './components/terminal/useTerminalCore.js';
export type {
  UseTerminalCoreOptions,
  UseTerminalCoreResult,
} from './components/terminal/useTerminalCore.js';

// Pluggable terminal views (xterm | restty)
export {
  createTerminalView,
  defaultTerminalViewFactory,
  createXtermTerminalView,
  createResttyTerminalView,
  XtermTerminalView,
  ResttyTerminalView,
} from './components/terminal/views/index.js';
export type {
  TerminalEngineId,
  TerminalView,
  TerminalViewCreateOptions,
  TerminalViewFactory,
  TerminalViewTheme,
  TerminalViewLifecycleEvent,
  Unsubscribe,
  CreateTerminalViewDeps,
  LoadRestty,
  LoadResttyXterm,
  ResttyInstance,
  ResttyCtor,
  ResttyXtermTerminal,
  ResttyXtermTerminalCtor,
  AvocadoPtyTransportHandlers,
  AvocadoPtyLifecycleState,
  AvocadoPtyLifecycleEvent,
  AvocadoPtyCallbacks,
  AvocadoPtyConnectOptions,
  AvocadoPtyResizeMeta,
  BundledFontFace,
} from './components/terminal/views/index.js';

export {
  AvocadoPtyTransport,
  createAvocadoPtyTransport,
  loadBundledMonoFont,
  buildResttyFontChain,
  hasBundledNerdCoverage,
} from './components/terminal/views/index.js';

export type {
  TerminalCoreState,
  TerminalCoreActions,
} from './components/terminal/renderers/types.js';

// Hooks
export { usePTYSessions } from './hooks/terminal/usePTYSessions.js';
export type {
  UsePTYSessionsResult,
  SessionSourceFilter,
} from './hooks/terminal/usePTYSessions.js';

export { useTerminals } from './hooks/terminal/useTerminals.js';
export type { UseTerminalsResult } from './hooks/terminal/useTerminals.js';

export { useTerminalGrid } from './hooks/terminal/useTerminalGrid.js';
export type { UseTerminalGridResult } from './hooks/terminal/useTerminalGrid.js';

export { useTerminalAPI } from './hooks/terminal/useTerminalAPI.js';
export type { UseTerminalAPIResult } from './hooks/terminal/useTerminalAPI.js';

export { useRemoteSessions } from './hooks/terminal/useRemoteSessions.js';
export type {
  UseRemoteSessionsResult,
  RemoteSessionOffer,
} from './hooks/terminal/useRemoteSessions.js';
