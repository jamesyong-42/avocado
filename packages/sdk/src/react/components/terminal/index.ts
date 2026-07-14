// Components
export { TerminalSurface } from './TerminalSurface.js';
export type { TerminalSurfaceProps } from './TerminalSurface.js';

export { VirtualTerminal } from './VirtualTerminal.js';
export type { VirtualTerminalProps } from './VirtualTerminal.js';

// Hooks
export { useTerminalCore } from './useTerminalCore.js';
export type {
  UseTerminalCoreOptions,
  UseTerminalCoreResult,
} from './useTerminalCore.js';

// Terminal view engines (xterm | restty)
export {
  createTerminalView,
  defaultTerminalViewFactory,
  createXtermTerminalView,
  createResttyTerminalView,
  XtermTerminalView,
  ResttyTerminalView,
} from './views/index.js';
export type {
  TerminalEngineId,
  TerminalView,
  TerminalViewCreateOptions,
  TerminalViewFactory,
  TerminalViewTheme,
  Unsubscribe,
  CreateTerminalViewDeps,
  LoadResttyXterm,
  ResttyXtermTerminal,
  ResttyXtermTerminalCtor,
} from './views/index.js';

// Core state types
export type {
  TerminalCoreState,
  TerminalCoreActions,
} from './renderers/types.js';
