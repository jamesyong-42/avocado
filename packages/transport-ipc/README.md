# `@avocado/transport-ipc`

IPC transport for [avocado](../../README.md) -- Unix Domain Socket
(macOS/Linux) and Named Pipe (Windows). Bridges CLI sessions to the
playground app running on the same machine.

## Components

### UDSServer (`uds-server.ts`)

Cross-platform IPC server using `net.createServer()`. Handles:

- Socket lifecycle (listen, accept, close, cleanup stale files)
- Wire format decode/encode (length-prefixed MessagePack via `wire.ts`)
- Hello/welcome handshake (intercepted before namespace routing)
- Heartbeat/heartbeat:ack (intercepted before namespace routing)
- Namespace-based message routing to registered endpoint handlers
- Platform detection (UDS on Unix, Named Pipes on Windows)

```typescript
import { createUDSServer } from '@avocado/transport-ipc';

const server = createUDSServer();
server.start({ socketPath: '~/.avocado/playground.sock' });

server.on('connectionReady', (conn) => {
  console.log(`Client connected: ${conn.id} v${conn.version}`);
});
```

### IPCPTYTransport (`ipc-transport.ts`)

Per-connection transport implementing the `IPTYTransport` interface from
`@avocado/types`. Handles incoming PTY messages (session:announce,
output, resize, focus, session:end) and outgoing commands (input, resize,
kill, focus) via the `IMessageBus`.

### PTYIPCBridge (`ipc-bridge.ts`)

Wires the IPC server to the PTY session manager:

1. Listens for `connectionReady` events from the UDS server
2. Creates an `IPCPTYTransport` for each CLI connection
3. Registers a PTY namespace handler to route messages to transports
4. Registers transports with `PTYSessionManager`
5. Cleans up on `clientDisconnected`

```typescript
import { createPTYIPCBridge, createUDSServer } from '@avocado/transport-ipc';
import { createPTYSessionManager } from '@avocado/core';

const sessionManager = createPTYSessionManager();
const server = createUDSServer();
const bridge = createPTYIPCBridge(sessionManager);

server.start({ socketPath: '~/.avocado/playground.sock' });
bridge.initialize(server);
// CLI sessions now flow into sessionManager
```

### Wire format (`wire.ts`)

Length-prefixed MessagePack framing shared between the server and
`@avocado/cli`. See `@avocado/cli` README for protocol details.

## Data flow

```
avo CLI                    UDSServer                 PTYIPCBridge          PTYSessionManager
  |                           |                          |                       |
  |-- hello ----------------->|                          |                       |
  |<-- welcome ---------------|                          |                       |
  |                           |-- connectionReady ------>|                       |
  |                           |                          |-- registerTransport ->|
  |-- session:announce ------>|-- pty handler ---------->|-- handleMessage ----->|
  |                           |                          |   sessionAnnounced    |-- sessionDiscovered
  |-- output ---------------->|-- pty handler ---------->|-- handleMessage ----->|
  |                           |                          |   output event        |-- output event
```
