/**
 * IPTYTransport - Bridge interface for transport layer
 *
 * This interface abstracts the transport layer used by ProxyPTYSession
 * to communicate with remote sessions.
 *
 * Implements the Bridge pattern:
 * - ProxyPTYSession uses IPTYTransport to send commands
 * - IPTYTransport handles the actual network communication
 * - Different transports (IPC, WS) implement this interface
 */

import { EventEmitter } from 'events';
import type { TransportType, RemoteSessionAnnounce } from '../types.js';

// ===============================================================================
// IPTYTRANSPORT INTERFACE
// ===============================================================================

/**
 * Bridge interface for PTY transport layer
 *
 * Transports handle:
 * - Connection management (connect/disconnect)
 * - Handshake protocol
 * - Message encoding/decoding
 * - Sending commands to remote
 * - Receiving events from remote
 */
export interface IPTYTransport extends EventEmitter {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** Unique transport identifier */
  readonly transportId: string;

  /** Transport type: 'ipc' or 'ws' */
  readonly transportType: TransportType;

  // ---------------------------------------------------------------------------
  // Connection State
  // ---------------------------------------------------------------------------

  /** Whether the transport is ready to send/receive messages */
  readonly isReady: boolean;

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  /**
   * Disconnect from the remote endpoint
   * @param reason Optional reason for disconnection
   */
  disconnect(reason?: string): void;

  /**
   * Dispose of the transport and clean up resources
   */
  dispose(): void;

  // ---------------------------------------------------------------------------
  // Outgoing Operations (Viewer -> Owner)
  // ---------------------------------------------------------------------------

  /** Send input to a remote session */
  sendInput(sessionId: string, data: string | Buffer): void;

  /** Send resize request to a remote session */
  sendResize(sessionId: string, cols: number, rows: number): void;

  /** Send kill request to a remote session */
  sendKill(sessionId: string, signal?: string): void;

  /** Send focus notification */
  sendFocus(sessionId: string, focused: boolean): void;

  // ---------------------------------------------------------------------------
  // Outgoing Operations (Owner -> Viewer) - for relay mode
  // ---------------------------------------------------------------------------

  /** Send output data to a remote viewer */
  sendOutput(sessionId: string, data: Buffer, targetDeviceId: string): void;

  /** Send resize notification to a remote viewer */
  sendResized(sessionId: string, cols: number, rows: number, targetDeviceId: string): void;

  /** Send session ended notification to a remote viewer */
  sendSessionEnded(sessionId: string, exitCode: number, targetDeviceId: string): void;

  /** Send focus changed notification to a remote viewer */
  sendFocusChanged(sessionId: string, focused: boolean, targetDeviceId: string): void;

  // ---------------------------------------------------------------------------
  // Incoming Events (Owner -> Viewer)
  // ---------------------------------------------------------------------------

  on(event: 'sessionAnnounced', listener: (info: RemoteSessionAnnounce) => void): this;
  once(event: 'sessionAnnounced', listener: (info: RemoteSessionAnnounce) => void): this;
  off(event: 'sessionAnnounced', listener: (info: RemoteSessionAnnounce) => void): this;

  on(event: 'sessionEnded', listener: (sessionId: string, exitCode: number, signal?: string) => void): this;
  once(event: 'sessionEnded', listener: (sessionId: string, exitCode: number, signal?: string) => void): this;
  off(event: 'sessionEnded', listener: (sessionId: string, exitCode: number, signal?: string) => void): this;

  on(event: 'output', listener: (sessionId: string, data: Buffer) => void): this;
  once(event: 'output', listener: (sessionId: string, data: Buffer) => void): this;
  off(event: 'output', listener: (sessionId: string, data: Buffer) => void): this;

  on(event: 'resized', listener: (sessionId: string, cols: number, rows: number) => void): this;
  once(event: 'resized', listener: (sessionId: string, cols: number, rows: number) => void): this;
  off(event: 'resized', listener: (sessionId: string, cols: number, rows: number) => void): this;

  on(event: 'focusChanged', listener: (sessionId: string, focused: boolean) => void): this;
  once(event: 'focusChanged', listener: (sessionId: string, focused: boolean) => void): this;
  off(event: 'focusChanged', listener: (sessionId: string, focused: boolean) => void): this;

  // ---------------------------------------------------------------------------
  // Command Events (Viewer -> Owner)
  // ---------------------------------------------------------------------------

  on(event: 'inputReceived', listener: (sessionId: string, data: Buffer) => void): this;
  once(event: 'inputReceived', listener: (sessionId: string, data: Buffer) => void): this;
  off(event: 'inputReceived', listener: (sessionId: string, data: Buffer) => void): this;

  on(event: 'resizeRequested', listener: (sessionId: string, cols: number, rows: number) => void): this;
  once(event: 'resizeRequested', listener: (sessionId: string, cols: number, rows: number) => void): this;
  off(event: 'resizeRequested', listener: (sessionId: string, cols: number, rows: number) => void): this;

  on(event: 'killRequested', listener: (sessionId: string, signal?: string) => void): this;
  once(event: 'killRequested', listener: (sessionId: string, signal?: string) => void): this;
  off(event: 'killRequested', listener: (sessionId: string, signal?: string) => void): this;

  on(event: 'focusReceived', listener: (sessionId: string, focused: boolean) => void): this;
  once(event: 'focusReceived', listener: (sessionId: string, focused: boolean) => void): this;
  off(event: 'focusReceived', listener: (sessionId: string, focused: boolean) => void): this;

  // ---------------------------------------------------------------------------
  // Connection Events
  // ---------------------------------------------------------------------------

  on(event: 'connected', listener: () => void): this;
  once(event: 'connected', listener: () => void): this;
  off(event: 'connected', listener: () => void): this;

  on(event: 'disconnected', listener: (reason: string) => void): this;
  once(event: 'disconnected', listener: (reason: string) => void): this;
  off(event: 'disconnected', listener: (reason: string) => void): this;

  on(event: 'handshakeCompleted', listener: (remoteVersion: string) => void): this;
  once(event: 'handshakeCompleted', listener: (remoteVersion: string) => void): this;
  off(event: 'handshakeCompleted', listener: (remoteVersion: string) => void): this;

  on(event: 'error', listener: (error: Error) => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;

  // Generic emit overloads
  emit(event: 'sessionAnnounced', info: RemoteSessionAnnounce): boolean;
  emit(event: 'sessionEnded', sessionId: string, exitCode: number, signal?: string): boolean;
  emit(event: 'output', sessionId: string, data: Buffer): boolean;
  emit(event: 'resized', sessionId: string, cols: number, rows: number): boolean;
  emit(event: 'focusChanged', sessionId: string, focused: boolean): boolean;
  emit(event: 'inputReceived', sessionId: string, data: Buffer): boolean;
  emit(event: 'resizeRequested', sessionId: string, cols: number, rows: number): boolean;
  emit(event: 'killRequested', sessionId: string, signal?: string): boolean;
  emit(event: 'focusReceived', sessionId: string, focused: boolean): boolean;
  emit(event: 'connected'): boolean;
  emit(event: 'disconnected', reason: string): boolean;
  emit(event: 'handshakeCompleted', remoteVersion: string): boolean;
  emit(event: 'error', error: Error): boolean;
}

// ===============================================================================
// TRANSPORT EVENTS TYPE
// ===============================================================================

/**
 * Type-safe event map for IPTYTransport
 */
export interface PTYTransportEvents {
  // Incoming events (Owner -> Viewer)
  sessionAnnounced: [info: RemoteSessionAnnounce];
  sessionEnded: [sessionId: string, exitCode: number];
  output: [sessionId: string, data: Buffer];
  resized: [sessionId: string, cols: number, rows: number];
  focusChanged: [sessionId: string, focused: boolean];

  // Command events (Viewer -> Owner)
  inputReceived: [sessionId: string, data: Buffer];
  resizeRequested: [sessionId: string, cols: number, rows: number];
  killRequested: [sessionId: string, signal?: string];
  focusReceived: [sessionId: string, focused: boolean];

  // Connection events
  connected: [];
  disconnected: [reason: string];
  handshakeCompleted: [remoteVersion: string];
  error: [error: Error];
}
