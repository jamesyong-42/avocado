/**
 * PTY Session Types - Shared type definitions for PTY session handling
 *
 * These types are used across all @avocado packages for terminal session management.
 */

// ===============================================================================
// SESSION SOURCE TYPES
// ===============================================================================

/**
 * Source of a PTY session
 * - local: Session spawned directly via node-pty
 * - ipc: Session proxied from CLI via IPC (Unix Domain Socket on macOS/Linux, Named Pipe on Windows)
 * - ws: Session proxied via WebSocket (mesh networking)
 */
export type SessionSource = 'local' | 'ipc' | 'ws';

/**
 * Transport type for proxy sessions
 * - ipc: Local IPC (Unix Domain Socket on macOS/Linux, Named Pipe on Windows)
 * - ws: WebSocket (mesh networking)
 */
export type TransportType = 'ipc' | 'ws';

// ===============================================================================
// SESSION METADATA
// ===============================================================================

/**
 * Base metadata for all remote sessions
 */
export interface BaseSessionMetadata {
  /** Client version string */
  clientVersion?: string;
  /** Project path for context */
  projectPath?: string;
}

/**
 * Metadata specific to IPC sessions (Unix Domain Socket on macOS/Linux, Named Pipe on Windows)
 */
export interface IPCSessionMetadata extends BaseSessionMetadata {
  /** Unique connection identifier */
  connectionId: string;
  /** Process ID of the CLI */
  pid?: number;
  /** CLI version (alias for clientVersion) */
  cliVersion?: string;
}

/**
 * Metadata specific to WebSocket sessions
 */
export interface WSSessionMetadata extends BaseSessionMetadata {
  /** Device ID in the mesh network */
  deviceId: string;
  /** Peer ID for direct connections */
  peerId?: string;
  /** Device name for display */
  deviceName?: string;
}

/**
 * Union of all session metadata types
 */
export type SessionMetadata = IPCSessionMetadata | WSSessionMetadata;

// ===============================================================================
// SESSION STATE
// ===============================================================================

/**
 * Full PTY session state
 */
export interface PTYSessionState {
  /** Unique session identifier */
  id: string;
  /** Source of the session */
  source: SessionSource;
  /** Process ID */
  pid: number;
  /** Command being executed */
  command: string;
  /** Current working directory */
  cwd: string;
  /** Terminal columns */
  cols: number;
  /** Terminal rows */
  rows: number;
  /** When the session started */
  startedAt: Date;
  /** Exit code if terminated */
  exitCode: number | null;
  /** Whether the session is still running */
  isRunning: boolean;
  /** Whether the session has focus */
  isFocused: boolean;
  /** Session-specific metadata */
  metadata?: SessionMetadata;
}

/**
 * Options for spawning a local PTY session
 */
export interface PTYSpawnOptions {
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Terminal columns */
  cols?: number;
  /** Terminal rows */
  rows?: number;
  /** Terminal name */
  name?: string;
}

/**
 * Options for creating a proxy session
 */
export interface PTYProxySessionOptions {
  /** Session ID (generated if not provided) */
  id?: string;
  /** Process ID of the remote session */
  pid?: number;
  /** Command being executed */
  command: string;
  /** Current working directory */
  cwd: string;
  /** Terminal columns */
  cols: number;
  /** Terminal rows */
  rows: number;
  /** Session metadata */
  metadata: SessionMetadata;
}

// ===============================================================================
// SESSION EVENTS
// ===============================================================================

/**
 * Terminal output event
 */
export interface PTYOutputEvent {
  sessionId: string;
  data: Buffer;
}

/**
 * Session exit event
 */
export interface PTYExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: string;
}

/**
 * Terminal resize event
 */
export interface PTYResizedEvent {
  sessionId: string;
  cols: number;
  rows: number;
  source: SessionSource;
  /** Whether resize originated locally or from remote */
  origin: 'local' | 'remote';
}

/**
 * Focus change event
 */
export interface PTYFocusChangedEvent {
  sessionId: string;
  focused: boolean;
}

/**
 * Session discovered event
 */
export interface PTYSessionDiscoveredEvent {
  session: PTYSessionState;
  source: SessionSource;
}

/**
 * Session lost event
 */
export interface PTYSessionLostEvent {
  sessionId: string;
  source: SessionSource;
  reason: string;
}

// ===============================================================================
// CONNECTION STATE
// ===============================================================================

/**
 * Transport connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * Handshake state for protocol negotiation
 */
export type HandshakeState = 'pending' | 'completed' | 'failed';

// ===============================================================================
// REMOTE SESSION ANNOUNCEMENT
// ===============================================================================

/**
 * Information announced when a remote session becomes available
 */
export interface RemoteSessionAnnounce {
  /** Session ID on the remote side */
  sessionId: string;
  /** Process ID */
  pid: number;
  /** Command being executed */
  command: string;
  /** Current working directory */
  cwd: string;
  /** Terminal columns */
  cols: number;
  /** Terminal rows */
  rows: number;
  /** Client version */
  clientVersion?: string;
  /** Project path */
  projectPath?: string;
}

// ===============================================================================
// REQUEST TYPES (for routing to handlers)
// ===============================================================================

/**
 * Write request for proxy sessions
 */
export interface PTYWriteRequest {
  sessionId: string;
  source: SessionSource;
  data: string;
  metadata: SessionMetadata;
}

/**
 * Resize request for proxy sessions
 */
export interface PTYResizeRequest {
  sessionId: string;
  source: SessionSource;
  cols: number;
  rows: number;
  metadata: SessionMetadata;
}

/**
 * Kill request for proxy sessions
 */
export interface PTYKillRequest {
  sessionId: string;
  source: SessionSource;
  signal?: string;
  metadata: SessionMetadata;
}
