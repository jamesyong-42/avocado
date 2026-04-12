# Quick Start

A minimal end-to-end example: spawn a local PTY, wire it into the session manager, render it with the React component.

## Server / Electron main

```ts
import {
  createPTYSessionManager,
  createTerminalService,
} from '@vibecook/avocado-sdk';
import { LocalPTYSession } from '@vibecook/avocado-sdk/node-pty';
import { spawn as ptySpawn } from 'node-pty';

const sessionManager = createPTYSessionManager();
const terminalService = createTerminalService(sessionManager);

// Spawn a local PTY and register it as a session.
const session = LocalPTYSession.spawn(
  (opts) => ptySpawn(opts.command, opts.args, opts),
  { command: process.env.SHELL ?? '/bin/bash', args: [], cwd: process.cwd(), cols: 120, rows: 32 },
  { command: 'bash', cwd: process.cwd() }
);
sessionManager.registerSession(session);
```

## Renderer (React)

```tsx
import { AvocadoProvider, TerminalGrid } from '@vibecook/avocado-sdk/react';

export function App() {
  return (
    <AvocadoProvider backend={electronBackend}>
      <TerminalGrid />
    </AvocadoProvider>
  );
}
```

## Cross-device sync via the mesh

Add the truffle transport and the session appears on every peer device:

```ts
import { createMeshNode } from '@vibecook/truffle';
import {
  PTYMeshBridge,
  PTYSyncStore,
  RemoteSessionService,
} from '@vibecook/avocado-sdk/transport-truffle';

const node = await createMeshNode({ appId: 'my-app', deviceName: 'laptop' });
const bridge = new PTYMeshBridge({ node, sessionManager });
const syncStore = new PTYSyncStore({ node });
const service = new RemoteSessionService({ node, sessionManager, bridge, syncStore });

await bridge.initialize();
await service.enable();
```

See the [transport-truffle guide](/guide/transport-truffle) for the full cross-device flow.
