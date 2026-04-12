/**
 * @avocado/cli — General-purpose terminal session wrapper with playground sync
 *
 * Wraps any command in a PTY and optionally syncs the session to the
 * avocado playground app over a Unix Domain Socket.
 *
 * Usage:
 *   avo                        # Wraps your default shell
 *   avo claude                 # Wraps the claude CLI
 *   avo -- htop                # Wraps htop
 *   avo -s /path/to/sock bash  # Custom socket path
 *
 * Features:
 * - Session-based protocol with unique session IDs
 * - Length-prefixed MessagePack wire format
 * - Hello/welcome handshake protocol
 * - Automatic reconnection with output buffering
 * - Heartbeat for connection health monitoring
 */

import { PTYHost } from './pty-host.js';
import { createSyncClient } from './sync-client.js';
import { Router } from './router.js';
import { DEFAULT_COMMAND } from './config.js';

// ═══════════════════════════════════════════════════════════════════════════
// CLI ARGUMENT PARSING
// ═══════════════════════════════════════════════════════════════════════════

interface ParsedArgs {
  command: string;
  args: string[];
  socketPath?: string;
  noSync: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const raw = argv.slice(2);
  let socketPath: string | undefined;
  let noSync = false;
  let dashDashIndex = -1;

  // Scan for avo's own flags before --
  const avoArgs: string[] = [];
  const rest: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '--') {
      dashDashIndex = i;
      rest.push(...raw.slice(i + 1));
      break;
    }
    if (raw[i] === '-s' || raw[i] === '--socket') {
      socketPath = raw[++i];
      continue;
    }
    if (raw[i] === '--no-sync') {
      noSync = true;
      continue;
    }
    if (raw[i] === '-h' || raw[i] === '--help') {
      printHelp();
      process.exit(0);
    }
    // Not an avo flag — this starts the command
    rest.push(...raw.slice(i));
    break;
  }

  const command = rest[0] ?? DEFAULT_COMMAND;
  const args = rest.slice(1);

  return { command, args, socketPath, noSync };
}

function printHelp(): void {
  console.log(`
avo — terminal session wrapper with playground sync

Usage:
  avo [options] [command] [args...]
  avo [options] -- [command] [args...]

Options:
  -s, --socket <path>   Custom socket path for playground connection
  --no-sync             Run without connecting to playground
  -h, --help            Show this help message

Examples:
  avo                   Wrap your default shell ($SHELL)
  avo claude            Wrap the claude CLI
  avo -- htop           Wrap htop (-- separates avo flags from command)
  avo --no-sync bash    Run bash without playground sync
`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TERMINAL TITLE
// ═══════════════════════════════════════════════════════════════════════════

let currentConnected = false;
let currentSessionId: string | undefined;
let currentMode: 'active' | 'passive' = 'active';

function updateTerminalTitle(options?: {
  connected?: boolean;
  sessionId?: string;
  mode?: 'active' | 'passive';
}): void {
  if (options?.connected !== undefined) currentConnected = options.connected;
  if (options?.sessionId !== undefined) currentSessionId = options.sessionId;
  if (options?.mode !== undefined) currentMode = options.mode;

  const modeIndicator = currentMode === 'active' ? '[ACTIVE]' : '[PASSIVE]';
  let title = `avo ${modeIndicator}`;
  if (currentConnected && currentSessionId) {
    title = `avo \u25cf ${currentSessionId.slice(0, 8)} ${modeIndicator}`;
  }
  process.stdout.write(`\x1b]0;${title}\x07`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const cwd = process.cwd();

  // Create sync client
  const syncClient = createSyncClient({
    cwd,
    command: parsed.command,
    pid: process.pid,
    cols,
    rows,
    socketPath: parsed.socketPath,
    autoRetry: !parsed.noSync,
  });

  // Handle sync client errors silently
  syncClient.on('error', () => {
    // Connection errors are expected when playground is not running.
    // The retry loop handles reconnection.
  });

  updateTerminalTitle({ connected: false, mode: 'active' });

  if (!parsed.noSync) {
    const connected = await syncClient.connect();
    if (connected) {
      updateTerminalTitle({ connected: true, sessionId: syncClient.getSessionId() });
    } else {
      syncClient.startRetrying();
    }
  }

  // Create PTY host
  const ptyHost = new PTYHost({
    command: parsed.command,
    args: parsed.args,
    cwd,
    env: process.env as Record<string, string>,
    cols,
    rows,
  });

  // Create router
  const router = new Router({
    pty: ptyHost,
    syncClient,
    stdin: process.stdin,
    stdout: process.stdout,
    onConnect: () => {
      updateTerminalTitle({ connected: true, sessionId: syncClient.getSessionId() });
    },
    onDisconnect: () => {
      updateTerminalTitle({ connected: false });
    },
    onModeChange: (mode) => {
      updateTerminalTitle({ mode });
    },
    allowPlaygroundInput: true,
    allowPlaygroundResize: true,
  });

  // Handle PTY exit
  ptyHost.on('exit', (code) => {
    if (syncClient.isConnected()) {
      syncClient.sendSessionEnd(code);
    }
    router.dispose();
    process.exit(code);
  });

  // Handle signals
  const handleSignal = (signal: NodeJS.Signals): void => {
    ptyHost.kill(signal);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  if (process.platform !== 'win32') {
    process.on('SIGHUP', () => handleSignal('SIGHUP'));
  }

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    console.error('\x1b[31m[avo] Fatal error:\x1b[0m', err.message);
    if (syncClient.isConnected()) {
      syncClient.sendSessionEnd(1);
    }
    router.dispose();
    process.exit(1);
  });

  // Start
  try {
    ptyHost.spawn();
    router.start();
  } catch (err) {
    const error = err as NodeJS.ErrnoException;

    if (error.code === 'ENOENT') {
      console.error(`\x1b[31mError: '${parsed.command}' command not found.\x1b[0m`);
      console.error(`Please ensure '${parsed.command}' is installed and in your PATH.`);
    } else {
      console.error('\x1b[31m[avo] Failed to start:\x1b[0m', error.message);
    }

    router.dispose();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\x1b[31m[avo] Fatal error:\x1b[0m', err);
  process.exit(1);
});
