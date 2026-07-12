export type {
  Unsubscribe,
  TerminalEngineId,
  TerminalViewTheme,
  TerminalViewCreateOptions,
  TerminalView,
  TerminalViewFactory,
  TerminalViewLifecycleEvent,
} from './types.js';

export { createTerminalView, defaultTerminalViewFactory } from './create-terminal-view.js';
export type { CreateTerminalViewDeps } from './create-terminal-view.js';

export { XtermTerminalView, createXtermTerminalView } from './xterm-view.js';
export {
  ResttyTerminalView,
  createResttyTerminalView,
} from './restty-view.js';
export type {
  ResttyInstance,
  ResttyCtor,
  LoadRestty,
  LoadResttyXterm,
  ResttyXtermTerminal,
  ResttyXtermTerminalCtor,
} from './restty-view.js';

export {
  AvocadoPtyTransport,
  createAvocadoPtyTransport,
} from './avocado-pty-transport.js';
export type {
  AvocadoPtyTransportHandlers,
  AvocadoPtyLifecycleState,
  AvocadoPtyLifecycleEvent,
  AvocadoPtyCallbacks,
  AvocadoPtyConnectOptions,
  AvocadoPtyResizeMeta,
} from './avocado-pty-transport.js';

export {
  loadBundledMonoFont,
  bundledFontResttyInput,
  buildResttyFontChain,
  hasBundledNerdCoverage,
} from './bundled-font.js';
export type { BundledFontFace, ResttyFontInputLike } from './bundled-font.js';

export {
  buildGhosttyParity,
  terminalViewThemeToGhostty,
  GHOSTTY_DEFAULT_THEME_NAME,
  GHOSTTY_DEFAULT_FONT_SIZE,
  GHOSTTY_WINDOW_PADDING_PX,
  GHOSTTY_DEFAULT_BG,
  GHOSTTY_DEFAULT_FG,
} from './ghostty-parity.js';
export type {
  GhosttyParityOptions,
  BuiltGhosttyParity,
  ResttyRendererPref,
  ResttyThemeLoader,
} from './ghostty-parity.js';
