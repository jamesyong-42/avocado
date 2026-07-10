/**
 * Shared IPC contract between the Electron main process and the renderer.
 *
 * The renderer imports `AvocadoAPI` from this file (via `@shared/ipc`) and
 * consumes it as `window.avocado`. The preload builds the bridge. The main
 * process implements the methods in `ipc-handlers.ts` by delegating to
 * `AvocadoManager`.
 *
 * Design:
 *
 *  - The `pty` and `terminal` slices of `AvocadoAPI` match
 *    `@vibecook/avocado-sdk/types/TerminalBackend` 1:1 so the renderer can wrap
 *    `window.avocado.{pty,terminal}` as a `TerminalBackend` and pass it to
 *    `<AvocadoProvider>` from `@vibecook/avocado-sdk/react`.
 *  - The `lifecycle` and `peers` slices are playground-specific extensions
 *    for starting the truffle node and listing mesh peers.
 *
 * This file is the single source of truth for all cross-process types and
 * channel names. No other file redefines these shapes.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

/** Cleanup function returned from every `onX(cb)` subscriber. */
export type Unsubscribe = () => void;

/** Local node identity as seen by the renderer. */
export interface NodeIdentity {
  appId: string;
  deviceId: string;
  deviceName: string;
  tailscaleHostname: string;
  tailscaleId: string;
  dnsName?: string;
  ip?: string;
}

/** Lifecycle state for the truffle node. */
export type NodeStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export interface NodeStatusEvent {
  status: NodeStatus;
  identity?: NodeIdentity;
  error?: string;
}

/**
 * A peer on the mesh as exposed to the renderer (RFC 022 / truffle ≥ 0.6).
 *
 * `peerRef` is the process-local primary key for lists and routing.
 * `deviceId` is the durable ULID once identity is known (null until then).
 */
export interface PeerInfo {
  /**
   * Process-local handle token `{tailscaleId}:{generation}`.
   * Primary key for peer lists — do not persist across restarts.
   */
  peerRef: string;
  /** Best UI label (identity name → hostname slug → short id). */
  displayName: string;
  /**
   * Durable ULID once the peer's hello is seen; null until then.
   * Persistence / debug only — not a routing key.
   */
  deviceId: string | null;
  /** Human-readable device name from the peer's hello, if known. */
  deviceName: string | null;
  /** Tailscale stable ID. Advanced / diagnostics. */
  tailscaleId: string;
  ip: string;
  online: boolean;
  wsConnected: boolean;
  connectionType: string;
  os?: string;
  lastSeen?: string;
}

/**
 * Serializable PTY session shape sent over IPC.
 *
 * Matches `@vibecook/avocado-sdk/types/TerminalBackend.pty.list()` return shape — note
 * that `createdAt` is epoch milliseconds (not a `Date`) so it can cross
 * the IPC boundary safely.
 */
export interface IPCPtySession {
  id: string;
  source: string;
  command: string;
  cwd: string;
  /** Epoch milliseconds. */
  createdAt: number;
  pid: number;
  cols: number;
  rows: number;
  isRunning: boolean;
  isFocused?: boolean;
  exitCode?: number | null;
  deviceId?: string;
}

/**
 * Serializable TerminalInfo sent over IPC.
 *
 * Matches `@vibecook/avocado-sdk/types/TerminalInfo`.
 */
export interface IPCTerminalInfo {
  id: string;
  sessionId: string;
  type: string;
  mode: string;
  cols: number;
  rows: number;
  /** Epoch milliseconds. */
  createdAt: number;
}

// ─── API slices ────────────────────────────────────────────────────────────

export interface LifecycleAPI {
  start(): Promise<NodeStatusEvent>;
  stop(): Promise<void>;
  getStatus(): Promise<NodeStatusEvent>;
  /** Open the Tailscale auth URL in the OS default browser. */
  openAuthUrl(url: string): Promise<void>;
  onStatusChanged(cb: (event: NodeStatusEvent) => void): Unsubscribe;
  onAuthRequired(cb: (url: string) => void): Unsubscribe;
}

export interface PeersAPI {
  list(): Promise<PeerInfo[]>;
  onChanged(cb: (peers: PeerInfo[]) => void): Unsubscribe;
}

/**
 * PTY slice — matches `TerminalBackend.pty` from `@vibecook/avocado-sdk/types`.
 *
 * `onOutput` delivers base64-encoded data to avoid binary transfer issues
 * across the Chromium/Node IPC boundary; the renderer decodes lazily when
 * the virtual terminal is wired to xterm.
 */
export interface PtyAPI {
  create(options: {
    cwd: string;
    cols: number;
    rows: number;
  }): Promise<{ success: boolean; sessionId?: string; error?: string }>;
  destroy(
    sessionId: string
  ): Promise<{ success: boolean; error?: string }>;
  list(): Promise<{
    success: boolean;
    sessions?: IPCPtySession[];
    error?: string;
  }>;
  listBySource(
    source: string
  ): Promise<{
    success: boolean;
    sessions?: IPCPtySession[];
    error?: string;
  }>;
  write(sessionId: string, data: string): Promise<void>;
  resize(
    sessionId: string,
    cols: number,
    rows: number
  ): Promise<{ success: boolean; error?: string }>;
  onOutput(
    cb: (terminalId: string, sessionId: string, base64Data: string) => void
  ): Unsubscribe;
  onExit(cb: (sessionId: string, exitCode: number) => void): Unsubscribe;
  onSessionDiscovered(
    cb: (data: { sessionId: string; source: string }) => void
  ): Unsubscribe;
  onSessionLost(
    cb: (data: { sessionId: string; source: string; reason: string }) => void
  ): Unsubscribe;
  onSessionResized(
    cb: (
      sessionId: string,
      cols: number,
      rows: number,
      source: string,
      origin: string
    ) => void
  ): Unsubscribe;
  onSessionFocusChanged(
    cb: (data: { sessionId: string; focused: boolean }) => void
  ): Unsubscribe;
}

/** Terminal slice — matches `TerminalBackend.terminal` from `@vibecook/avocado-sdk/types`. */
export interface TerminalAPI {
  createVirtual(
    sessionId: string,
    options: { cols: number; rows: number; mode: string }
  ): Promise<{ success: boolean; terminalId?: string; error?: string }>;
  createHeadless(
    sessionId: string,
    options: { cols: number; rows: number; mode: string }
  ): Promise<{ success: boolean; terminalId?: string; error?: string }>;
  destroy(
    terminalId: string
  ): Promise<{ success: boolean; error?: string }>;
  list(): Promise<{
    success: boolean;
    terminals?: IPCTerminalInfo[];
    error?: string;
  }>;
  resize(
    terminalId: string,
    cols: number,
    rows: number
  ): Promise<{ success: boolean; error?: string }>;
  setActive(
    terminalId: string
  ): Promise<{ success: boolean; error?: string }>;
  getScreenLines(
    terminalId: string
  ): Promise<{ success: boolean; lines?: string[]; error?: string }>;
  getCursorPosition(
    terminalId: string
  ): Promise<{
    success: boolean;
    position?: { x: number; y: number };
    error?: string;
  }>;
  getInfo(
    terminalId: string
  ): Promise<{
    success: boolean;
    terminal?: IPCTerminalInfo;
    error?: string;
  }>;
  getSessionDimensions(
    sessionId: string
  ): Promise<{
    success: boolean;
    dimensions?: { cols: number; rows: number };
    error?: string;
  }>;
  getActiveTerminal(
    sessionId: string
  ): Promise<{
    success: boolean;
    terminal?: IPCTerminalInfo;
    error?: string;
  }>;
  onModeChanged(
    cb: (data: { terminalId: string; sessionId: string; mode: string }) => void
  ): Unsubscribe;
  onDestroyed(
    cb: (terminalId: string, sessionId: string) => void
  ): Unsubscribe;
}

/** A remote session offered by a peer device. */
export interface RemoteSessionOffer {
  deviceId: string;
  deviceName: string;
  sessionId: string;
  command: string;
  cwd: string;
  cols: number;
  rows: number;
  pid: number;
}

export interface RemoteSessionsAPI {
  list(): Promise<RemoteSessionOffer[]>;
  onChanged(cb: (offers: RemoteSessionOffer[]) => void): Unsubscribe;
}

export interface AvocadoAPI {
  lifecycle: LifecycleAPI;
  peers: PeersAPI;
  pty: PtyAPI;
  terminal: TerminalAPI;
  remoteSessions: RemoteSessionsAPI;
}

// ─── IPC channel names ─────────────────────────────────────────────────────
// Centralised so the main process, preload bridge, and renderer all agree on
// exact strings. Renderer code should never reference these directly — it
// uses `window.avocado`.

export const IPC = {
  // Lifecycle (invoke)
  LIFECYCLE_START: 'avocado:lifecycle:start',
  LIFECYCLE_STOP: 'avocado:lifecycle:stop',
  LIFECYCLE_GET_STATUS: 'avocado:lifecycle:getStatus',
  LIFECYCLE_OPEN_AUTH_URL: 'avocado:lifecycle:openAuthUrl',
  // Lifecycle (push)
  EVT_STATUS_CHANGED: 'avocado:event:statusChanged',
  EVT_AUTH_REQUIRED: 'avocado:event:authRequired',

  // Peers (invoke)
  PEERS_LIST: 'avocado:peers:list',
  // Peers (push)
  EVT_PEERS_CHANGED: 'avocado:event:peersChanged',

  // PTY (invoke)
  PTY_CREATE: 'avocado:pty:create',
  PTY_DESTROY: 'avocado:pty:destroy',
  PTY_LIST: 'avocado:pty:list',
  PTY_WRITE: 'avocado:pty:write',
  PTY_RESIZE: 'avocado:pty:resize',
  PTY_LIST_BY_SOURCE: 'avocado:pty:listBySource',
  // PTY (push)
  EVT_PTY_OUTPUT: 'avocado:event:pty:output',
  EVT_PTY_EXIT: 'avocado:event:pty:exit',
  EVT_PTY_SESSION_DISCOVERED: 'avocado:event:pty:sessionDiscovered',
  EVT_PTY_SESSION_LOST: 'avocado:event:pty:sessionLost',
  EVT_PTY_SESSION_RESIZED: 'avocado:event:pty:sessionResized',
  EVT_PTY_SESSION_FOCUS_CHANGED: 'avocado:event:pty:sessionFocusChanged',

  // Terminal (invoke)
  TERMINAL_CREATE_VIRTUAL: 'avocado:terminal:createVirtual',
  TERMINAL_CREATE_HEADLESS: 'avocado:terminal:createHeadless',
  TERMINAL_DESTROY: 'avocado:terminal:destroy',
  TERMINAL_LIST: 'avocado:terminal:list',
  TERMINAL_RESIZE: 'avocado:terminal:resize',
  TERMINAL_SET_ACTIVE: 'avocado:terminal:setActive',
  TERMINAL_GET_SCREEN_LINES: 'avocado:terminal:getScreenLines',
  TERMINAL_GET_CURSOR_POSITION: 'avocado:terminal:getCursorPosition',
  TERMINAL_GET_INFO: 'avocado:terminal:getInfo',
  TERMINAL_GET_SESSION_DIMENSIONS: 'avocado:terminal:getSessionDimensions',
  TERMINAL_GET_ACTIVE: 'avocado:terminal:getActive',
  // Terminal (push)
  EVT_TERMINAL_DESTROYED: 'avocado:event:terminal:destroyed',
  EVT_TERMINAL_MODE_CHANGED: 'avocado:event:terminal:modeChanged',

  // Remote Sessions (invoke)
  REMOTE_SESSIONS_LIST: 'avocado:remoteSessions:list',
  // Remote Sessions (push)
  EVT_REMOTE_SESSIONS_CHANGED: 'avocado:event:remoteSessions:changed',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
