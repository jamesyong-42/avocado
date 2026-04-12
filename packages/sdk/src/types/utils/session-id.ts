/**
 * Session ID Utilities
 *
 * Functions for generating, parsing, and working with PTY session IDs.
 *
 * Session ID formats:
 * - CLI sessions: cli-{pid}-{timestamp}-{random}
 * - Local sessions: local-{uuid}
 * - Namespaced IDs: {source}|{connectionId}|{originalId}
 */

import { randomUUID } from 'crypto';
import { homedir } from 'os';
import { join } from 'path';
import type { SessionSource } from '../types.js';

// ===============================================================================
// SESSION ID GENERATION
// ===============================================================================

/**
 * Generate a CLI session ID
 * Format: cli-{pid}-{timestamp}-{random}
 */
export function generateCliSessionId(pid: number): string {
  const timestamp = Date.now().toString(36);
  const random = randomUUID().slice(0, 8);
  return `cli-${pid}-${timestamp}-${random}`;
}

/**
 * Generate a local session ID
 * Format: local-{uuid}
 */
export function generateLocalSessionId(): string {
  return `local-${randomUUID()}`;
}

/**
 * Generate a session ID for any source
 */
export function generateSessionId(source: SessionSource, pid?: number): string {
  switch (source) {
    case 'local':
      return generateLocalSessionId();
    case 'ipc':
    case 'ws':
      return pid !== undefined ? generateCliSessionId(pid) : generateLocalSessionId();
    default:
      return generateLocalSessionId();
  }
}

// ===============================================================================
// NAMESPACED SESSION IDS
// ===============================================================================

/**
 * Delimiter for namespaced session IDs.
 * Pipe (`|`) is used because colons appear frequently in identifiers.
 */
const NAMESPACE_DELIMITER = '|';

/**
 * Parsed namespaced ID components
 */
export interface NamespacedId {
  source: SessionSource;
  connectionId: string;
  originalId: string;
}

/**
 * Create a namespaced session ID
 * Format: {source}|{connectionId}|{originalId}
 */
export function createNamespacedId(
  source: SessionSource,
  connectionId: string,
  originalId: string
): string {
  return `${source}${NAMESPACE_DELIMITER}${connectionId}${NAMESPACE_DELIMITER}${originalId}`;
}

/**
 * Parse a namespaced session ID
 * @returns Parsed components, or null if invalid format
 */
export function parseNamespacedId(namespacedId: string): NamespacedId | null {
  const parts = namespacedId.split(NAMESPACE_DELIMITER);

  if (parts.length < 3) {
    return null;
  }

  const source = parts[0] as SessionSource;
  const connectionId = parts[1];
  // Join remaining parts in case originalId contains pipes
  const originalId = parts.slice(2).join(NAMESPACE_DELIMITER);

  if (!isValidSource(source)) {
    return null;
  }

  return { source, connectionId, originalId };
}

/**
 * Check if a session ID is namespaced
 */
export function isNamespacedId(sessionId: string): boolean {
  return parseNamespacedId(sessionId) !== null;
}

/**
 * Extract the original session ID from a namespaced ID
 * Returns the ID unchanged if not namespaced
 */
export function getOriginalId(sessionId: string): string {
  const parsed = parseNamespacedId(sessionId);
  return parsed ? parsed.originalId : sessionId;
}

/**
 * Extract the connection ID from a namespaced session ID
 * Returns null if not namespaced
 */
export function getConnectionId(sessionId: string): string | null {
  const parsed = parseNamespacedId(sessionId);
  return parsed ? parsed.connectionId : null;
}

// ===============================================================================
// VALIDATION
// ===============================================================================

/**
 * Check if a string is a valid session source
 */
export function isValidSource(source: string): source is SessionSource {
  return source === 'local' || source === 'ipc' || source === 'ws';
}

/**
 * Check if a session ID appears to be a CLI session
 */
export function isCliSessionId(sessionId: string): boolean {
  return sessionId.startsWith('cli-');
}

/**
 * Check if a session ID appears to be a local session
 */
export function isLocalSessionId(sessionId: string): boolean {
  return sessionId.startsWith('local-');
}

// ===============================================================================
// SOCKET PATH UTILITIES
// ===============================================================================

/**
 * Get the socket directory path
 */
export function getSocketDir(): string {
  return join(homedir(), '.claude-go');
}

/**
 * Get the UDS socket path
 */
export function getSocketPath(): string {
  return join(getSocketDir(), 'desktop.sock');
}
