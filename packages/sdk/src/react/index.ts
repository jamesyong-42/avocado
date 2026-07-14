/**
 * #react - Barrel export
 *
 * React terminal components, hooks, and context for the avocado terminal library.
 */

// Context
export { AvocadoProvider, useAvocadoBackend } from './context/AvocadoProvider.js';
export type { AvocadoProviderProps } from './context/AvocadoProvider.js';

// Components
export { TerminalSurface } from './components/terminal/TerminalSurface.js';
export type { TerminalSurfaceProps } from './components/terminal/TerminalSurface.js';

export { VirtualTerminal } from './components/terminal/VirtualTerminal.js';
export type { VirtualTerminalProps } from './components/terminal/VirtualTerminal.js';

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
  buildGhosttyParity,
  terminalViewThemeToGhostty,
  GHOSTTY_DEFAULT_THEME_NAME,
  GHOSTTY_DEFAULT_FONT_SIZE,
  GHOSTTY_WINDOW_PADDING_PX,
  GHOSTTY_DEFAULT_BG,
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

export { useTerminalGrid, defaultGridLayout } from './hooks/terminal/useTerminalGrid.js';
export type {
  GridLayout,
  UseTerminalGridOptions,
  UseTerminalGridResult,
} from './hooks/terminal/useTerminalGrid.js';

export { useTerminalSnapshot } from './hooks/terminal/useTerminalSnapshot.js';
export type {
  TerminalSnapshot,
  UseTerminalSnapshotOptions,
  UseTerminalSnapshotResult,
} from './hooks/terminal/useTerminalSnapshot.js';

export { useResizeHandle } from './hooks/useResizeHandle.js';
export type {
  UseResizeHandleOptions,
  UseResizeHandleResult,
  ResizeHandleDirection,
  ResizeHandleProps,
  ResizeHandleSize,
} from './hooks/useResizeHandle.js';

export { useTerminalAPI } from './hooks/terminal/useTerminalAPI.js';
export type { UseTerminalAPIResult } from './hooks/terminal/useTerminalAPI.js';

export { useRemoteSessions } from './hooks/terminal/useRemoteSessions.js';
export type {
  UseRemoteSessionsResult,
  RemoteSessionOffer,
} from './hooks/terminal/useRemoteSessions.js';
