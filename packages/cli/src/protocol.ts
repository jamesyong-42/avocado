/**
 * Protocol — Message constructors and type guards
 *
 * Defines message payload types for the PTY namespace and provides
 * factory functions and type guards for each message type.
 */

import { randomUUID } from 'crypto';
import { PTY_NAMESPACE, type NamespacedMessage } from './wire.js';

// ═══════════════════════════════════════════════════════════════════════════
// PAYLOAD TYPES — CLI → Playground
// ═══════════════════════════════════════════════════════════════════════════

export interface HelloPayload {
  version: string;
  pid?: number;
}

export interface SessionAnnouncePayload {
  sessionId: string;
  pid: number;
  command: string;
  cwd: string;
  cols: number;
  rows: number;
  cliVersion: string;
  projectPath?: string;
}

export interface OutputPayload {
  sessionId: string;
  data: string; // base64 encoded
}

export interface SessionEndPayload {
  sessionId: string;
  exitCode: number;
}

export interface ResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface HeartbeatPayload {
  sessionId: string;
  timestamp: number;
}

export interface FocusPayload {
  sessionId: string;
  focused: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYLOAD TYPES — Playground → CLI
// ═══════════════════════════════════════════════════════════════════════════

export interface WelcomePayload {
  desktopVersion: string;
}

export interface InputPayload {
  sessionId: string;
  data: string; // base64 encoded
}

export interface KillPayload {
  sessionId: string;
  signal?: string;
}

export interface HeartbeatAckPayload {
  timestamp: number;
  receivedTimestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE CONSTRUCTORS
// ═══════════════════════════════════════════════════════════════════════════

function createMessage<T>(
  type: string,
  payload: T,
  namespace: string = PTY_NAMESPACE
): NamespacedMessage<T> {
  return { namespace, type, payload, timestamp: Date.now() };
}

export function createHello(
  version: string,
  pid?: number
): NamespacedMessage<HelloPayload> {
  return createMessage('hello', { version, pid });
}

export function createSessionAnnounce(
  sessionId: string,
  pid: number,
  command: string,
  cwd: string,
  cols: number,
  rows: number,
  cliVersion: string
): NamespacedMessage<SessionAnnouncePayload> {
  return createMessage('session:announce', {
    sessionId,
    pid,
    command,
    cwd,
    cols,
    rows,
    cliVersion,
  });
}

export function createOutput(
  sessionId: string,
  data: Buffer
): NamespacedMessage<OutputPayload> {
  return createMessage('output', {
    sessionId,
    data: data.toString('base64'),
  });
}

export function createSessionEnd(
  sessionId: string,
  exitCode: number
): NamespacedMessage<SessionEndPayload> {
  return createMessage('session:end', { sessionId, exitCode });
}

export function createResize(
  sessionId: string,
  cols: number,
  rows: number
): NamespacedMessage<ResizePayload> {
  return createMessage('resize', { sessionId, cols, rows });
}

export function createHeartbeat(
  sessionId: string
): NamespacedMessage<HeartbeatPayload> {
  return createMessage('heartbeat', { sessionId, timestamp: Date.now() });
}

export function createFocus(
  sessionId: string,
  focused: boolean
): NamespacedMessage<FocusPayload> {
  return createMessage('focus', { sessionId, focused });
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

export function isPtyMessage(msg: NamespacedMessage): boolean {
  return msg.namespace === PTY_NAMESPACE;
}

export function isWelcome(
  msg: NamespacedMessage
): msg is NamespacedMessage<WelcomePayload> {
  return msg.namespace === PTY_NAMESPACE && msg.type === 'welcome';
}

export function isFocus(
  msg: NamespacedMessage
): msg is NamespacedMessage<FocusPayload> {
  return msg.namespace === PTY_NAMESPACE && msg.type === 'focus';
}

export function isInput(
  msg: NamespacedMessage
): msg is NamespacedMessage<InputPayload> {
  return msg.namespace === PTY_NAMESPACE && msg.type === 'input';
}

export function isResize(
  msg: NamespacedMessage
): msg is NamespacedMessage<ResizePayload> {
  return msg.namespace === PTY_NAMESPACE && msg.type === 'resize';
}

export function isKill(
  msg: NamespacedMessage
): msg is NamespacedMessage<KillPayload> {
  return msg.namespace === PTY_NAMESPACE && msg.type === 'kill';
}

export function isHeartbeatAck(
  msg: NamespacedMessage
): msg is NamespacedMessage<HeartbeatAckPayload> {
  return msg.namespace === PTY_NAMESPACE && msg.type === 'heartbeat:ack';
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique session ID.
 * Format: avo-{pid}-{timestamp}-{random}
 */
export function generateSessionId(pid: number): string {
  const timestamp = Date.now().toString(36);
  const random = randomUUID().slice(0, 8);
  return `avo-${pid}-${timestamp}-${random}`;
}
