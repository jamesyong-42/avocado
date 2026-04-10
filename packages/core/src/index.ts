/**
 * @avocado/core - Barrel export
 *
 * Core PTY session management, terminal service, and transport infrastructure.
 */

// PTY Session Manager
export {
  PTYSessionManager,
  createPTYSessionManager,
} from './pty-session-manager.js';
export type {
  SessionDiscoveredEvent,
  SessionLostEvent,
  SessionOutputEvent,
  SessionExitEvent,
  SessionResizedEvent,
  SessionFocusChangedEvent,
  ProxySessionFactory,
} from './pty-session-manager.js';

// Terminal Service
export {
  TerminalServiceImpl,
  createTerminalService,
} from './terminal-service.js';
export type {
  PTYSessionInfo,
  IPTYSessionSource,
  TerminalType,
  TerminalMode,
  TerminalCreateOptions,
  TerminalInfo,
  TerminalDimensions,
  ITerminalStoreSync,
  TerminalService,
} from './terminal-service.js';

// Terminal Store Sync
export {
  TerminalStoreSyncImpl,
  createTerminalStoreSync,
} from './terminal-store-sync.js';
export type {
  TerminalEntryMode,
  TerminalEntryType,
  TerminalEntry,
  TerminalsStoreData,
  TerminalStoreSyncEvents,
  ITerminalStoreSync as ITerminalStoreSyncFull,
  ITerminalStoreBackend,
} from './terminal-store-sync.js';

// IPC transport (IPCPTYTransport, PTYIPCBridge) moved to @avocado/transport-ipc
