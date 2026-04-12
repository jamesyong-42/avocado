/**
 * Configuration constants for @avocado/cli
 *
 * Socket paths, timing, and version constants.
 */

import { homedir } from 'os';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// VERSION
// ═══════════════════════════════════════════════════════════════════════════

export const CLI_VERSION = '0.1.0';

// ═══════════════════════════════════════════════════════════════════════════
// IPC SOCKET PATHS (Cross-Platform)
// ═══════════════════════════════════════════════════════════════════════════

const IPC_SOCKET_DIR = '.avocado';
const IPC_SOCKET_NAME = 'playground.sock';
const IPC_PIPE_NAME = 'avocado-playground';

export function getSocketDir(): string {
  if (process.platform === 'win32') {
    return ''; // Named pipes don't have directories
  }
  return join(homedir(), IPC_SOCKET_DIR);
}

export function getSocketPath(): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${IPC_PIPE_NAME}`;
  }
  return join(getSocketDir(), IPC_SOCKET_NAME);
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMING CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Heartbeat ping interval */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Timeout for initial UDS connection attempt */
export const CONNECTION_TIMEOUT_MS = 5_000;

/** Interval between auto-retry attempts */
export const RETRY_INTERVAL_MS = 5_000;

/** Timeout waiting for welcome handshake response */
export const HANDSHAKE_TIMEOUT_MS = 5_000;

/** Max buffered output when disconnected (1 MB) */
export const MAX_OUTPUT_BUFFER_SIZE = 1024 * 1024;

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

/** Default command when none specified — user's shell */
export const DEFAULT_COMMAND =
  process.platform === 'win32'
    ? (process.env['COMSPEC'] ?? 'cmd.exe')
    : (process.env['SHELL'] ?? '/bin/bash');
