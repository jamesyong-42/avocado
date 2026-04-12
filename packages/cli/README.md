# `@vibecook/avocado`

General-purpose terminal session wrapper that syncs to the avocado
playground app over a Unix Domain Socket (macOS/Linux) or Named Pipe
(Windows).

## Install

```bash
npm i -g @vibecook/avocado
```

Or from this monorepo:

```bash
# From the workspace root
pnpm install

# Build the CLI
pnpm -C packages/cli run build

# Link globally (optional)
cd packages/cli && pnpm link --global
```

## Usage

```bash
avo                          # Wraps your default shell ($SHELL)
avo claude                   # Wraps the claude CLI
avo -- htop                  # Wraps htop (-- separates avo flags from command)
avo --no-sync bash           # Run without playground connection
avo -s /path/to/sock bash    # Custom socket path
```

On startup, `avo` prints a TUI banner showing the wrapped command,
session ID, and sync status:

```
+-- avocado v0.1.0 -------------------------------------------------------+
|                                                                          |
|  AVO                                                                     |
|                                                                          |
|  terminal session wrapper                                                |
|                                                                          |
|  cmd  /bin/zsh                                                           |
|  id   avo-12345-abc123                                                   |
|  sync * connected to playground                                          |
|                                                                          |
+--------------------------------------------------------------------------+
```

Type `exit` or press `Ctrl+D` to leave the wrapped session.

## How it works

```
avo bash
  |
  +-- PTYHost (node-pty)         Spawns the command in a pseudo-terminal
  +-- Router                     Multiplexes I/O between PTY, stdin/stdout, and sync
  +-- SyncClient                 Connects to playground via UDS
  |     +-- Transport            Length-prefixed MessagePack over Unix Domain Socket
  |     +-- Handshake            hello -> welcome -> session:announce
  |     +-- Heartbeat            30s pings for connection health
  |     +-- Output Buffering     Up to 1MB buffered when disconnected
  +-- RealTerminal               Active/passive mode for focus management
```

The CLI works standalone -- if the playground isn't running, it silently
retries in the background and buffers output until a connection is
established.

## Architecture

| File | Role |
|------|------|
| `src/index.ts` | Entry point, CLI arg parsing, banner, main loop |
| `src/config.ts` | Socket paths, timing constants, defaults |
| `src/wire.ts` | Length-prefixed MessagePack encode/decode |
| `src/protocol.ts` | Message constructors and type guards |
| `src/transport.ts` | UDS client with auto-retry and output buffering |
| `src/sync-client.ts` | High-level handshake, heartbeat, session API |
| `src/router.ts` | I/O multiplexer (PTY <-> stdin/stdout <-> sync) |
| `src/pty-host.ts` | Generic PTY spawner via node-pty |
| `src/terminal/` | Active/passive terminal mode management |

## Protocol

Wire format: 4-byte big-endian length + 1-byte flags + MessagePack payload.

Handshake sequence:

```
CLI                             Playground
 |--- hello {version, pid} ------->|
 |<-- welcome {desktopVersion} ----|
 |--- session:announce ----------->|
 |    {sessionId, command, cwd,    |
 |     cols, rows, pid}            |
 |                                 |
 |--- output (base64) ------------>|  (bidirectional from here)
 |<-- input (base64) --------------|
 |<-- resize ----------------------|
 |--- heartbeat ------------------>|
 |<-- heartbeat:ack ---------------|
```

## Socket path

| Platform | Path |
|----------|------|
| macOS/Linux | `~/.avocado/playground.sock` |
| Windows | `\\.\pipe\avocado-playground` |
