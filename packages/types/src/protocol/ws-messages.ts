/**
 * WS PTY Protocol Messages
 *
 * Defines WebSocket-specific PTY protocol messages for mesh networking.
 * These are used for Desktop-to-Desktop session sharing over the mesh.
 */

// ===============================================================================
// MESSAGE TYPE CONSTANTS
// ===============================================================================

/**
 * WS PTY message type constants
 */
export const WS_PTY_MESSAGE_TYPES = {
  SESSION_ENDED: 'pty:session:ended',
  SUBSCRIBE: 'pty:subscribe',
  UNSUBSCRIBE: 'pty:unsubscribe',
  INPUT: 'pty:input',
  RESIZE: 'pty:resize',
  KILL: 'pty:kill',
  OUTPUT: 'pty:output',
  RESIZED: 'pty:resized',
  FOCUS_CHANGED: 'pty:focus:changed',
  CREATE_SESSION: 'pty:create:session',
  SESSION_CREATED: 'pty:session:created',
  CREATE_FAILED: 'pty:create:failed',
} as const;

export type WSPTYMessageType = (typeof WS_PTY_MESSAGE_TYPES)[keyof typeof WS_PTY_MESSAGE_TYPES];

// ===============================================================================
// SESSION LIFECYCLE PAYLOADS
// ===============================================================================

export interface WSSessionEndedPayload {
  sessionId: string;
  exitCode?: number;
  signal?: string;
}

// ===============================================================================
// VIEWER -> OWNER PAYLOADS
// ===============================================================================

export interface WSSubscribePayload {
  sessionId: string;
}

export interface WSUnsubscribePayload {
  sessionId: string;
}

export interface WSInputPayload {
  sessionId: string;
  /** Base64 encoded input data */
  data: string;
}

export interface WSResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface WSKillPayload {
  sessionId: string;
  signal?: string;
}

// ===============================================================================
// OWNER -> VIEWER PAYLOADS
// ===============================================================================

export interface WSOutputPayload {
  sessionId: string;
  /** Base64 encoded output data */
  data: string;
}

export interface WSResizedPayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface WSFocusChangedPayload {
  sessionId: string;
  focused: boolean;
}

// ===============================================================================
// REMOTE SESSION CREATION PAYLOADS
// ===============================================================================

export interface WSCreateSessionPayload {
  cwd?: string;
  cols?: number;
  rows?: number;
  command?: string;
  args?: string[];
}

export interface WSSessionCreatedPayload {
  sessionId: string;
  pid: number;
  command: string;
  cwd: string;
  cols: number;
  rows: number;
}

export interface WSCreateFailedPayload {
  error: string;
  code?: string;
}

// ===============================================================================
// WS SESSION METADATA
// ===============================================================================

export interface WSRemoteSessionMetadata {
  ownerDeviceId: string;
  ownerDeviceName?: string;
  originalSource: 'local' | 'ipc';
  focusedDeviceId?: string;
  hasFocus?: boolean;
}

// ===============================================================================
// TYPE GUARDS
// ===============================================================================

export function isWSPTYMessageType(type: string): type is WSPTYMessageType {
  return Object.values(WS_PTY_MESSAGE_TYPES).includes(type as WSPTYMessageType);
}

export function isWSOutputPayload(payload: unknown): payload is WSOutputPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sessionId' in payload &&
    'data' in payload &&
    typeof (payload as WSOutputPayload).data === 'string'
  );
}

export function isWSInputPayload(payload: unknown): payload is WSInputPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sessionId' in payload &&
    'data' in payload &&
    typeof (payload as WSInputPayload).data === 'string'
  );
}

export function isWSResizePayload(payload: unknown): payload is WSResizePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sessionId' in payload &&
    'cols' in payload &&
    'rows' in payload
  );
}

export function isWSSubscribePayload(payload: unknown): payload is WSSubscribePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sessionId' in payload &&
    typeof (payload as WSSubscribePayload).sessionId === 'string'
  );
}
