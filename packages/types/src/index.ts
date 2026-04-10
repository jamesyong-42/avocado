/**
 * @avocado/types - Barrel export
 *
 * All shared types, interfaces, and utilities for the avocado terminal library.
 */

// Core types
export type {
  SessionSource,
  TransportType,
  BaseSessionMetadata,
  IPCSessionMetadata,
  WSSessionMetadata,
  SessionMetadata,
  PTYSessionState,
  PTYSpawnOptions,
  PTYProxySessionOptions,
  PTYOutputEvent,
  PTYExitEvent,
  PTYResizedEvent,
  PTYFocusChangedEvent,
  PTYSessionDiscoveredEvent,
  PTYSessionLostEvent,
  ConnectionState,
  HandshakeState,
  RemoteSessionAnnounce,
  PTYWriteRequest,
  PTYResizeRequest,
  PTYKillRequest,
} from './types.js';

// Interfaces
export type { IPTYSession, PTYSessionEvents } from './interfaces/pty-session.js';
export type { IPTYTransport, PTYTransportEvents } from './interfaces/pty-transport.js';

// Sessions
export { BasePTYSession, DEFAULT_COLS, DEFAULT_ROWS } from './sessions/base-pty-session.js';
export type { BasePTYSessionOptions } from './sessions/base-pty-session.js';

// Utils
export {
  generateCliSessionId,
  generateLocalSessionId,
  generateSessionId,
  createNamespacedId,
  parseNamespacedId,
  isNamespacedId,
  getOriginalId,
  getConnectionId,
  isValidSource,
  isCliSessionId,
  isLocalSessionId,
  getSocketDir,
  getSocketPath,
} from './utils/session-id.js';
export type { NamespacedId } from './utils/session-id.js';

export {
  CircularOutputBuffer,
  createOutputBuffer,
  MAX_OUTPUT_BUFFER_SIZE,
} from './utils/output-buffer.js';

// Protocol
export {
  WS_PTY_MESSAGE_TYPES,
  isWSPTYMessageType,
  isWSOutputPayload,
  isWSInputPayload,
  isWSResizePayload,
  isWSSubscribePayload,
} from './protocol/ws-messages.js';
export type {
  WSPTYMessageType,
  WSSessionEndedPayload,
  WSSubscribePayload,
  WSUnsubscribePayload,
  WSInputPayload,
  WSResizePayload,
  WSKillPayload,
  WSOutputPayload,
  WSResizedPayload,
  WSFocusChangedPayload,
  WSCreateSessionPayload,
  WSSessionCreatedPayload,
  WSCreateFailedPayload,
  WSRemoteSessionMetadata,
} from './protocol/ws-messages.js';

// Terminal types (renderer-side)
export type {
  TerminalType,
  TerminalMode,
  PtySession,
  IPCConnectionInfo,
  TerminalInfo,
  TerminalSettings,
  CreateSessionOptions,
  CreateTerminalOptions,
} from './terminal-types.js';

// Backend interface
export type { TerminalBackend } from './backend.js';
