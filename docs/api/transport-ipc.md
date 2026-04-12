# `@vibecook/avocado-sdk/transport-ipc`

Unix Domain Socket / Named Pipe transport. Lets a CLI (the `avo` binary) connect to a long-running host process and share sessions bidirectionally.

```ts
import { createUDSServer, createPTYIPCBridge } from '@vibecook/avocado-sdk/transport-ipc';
import { createPTYSessionManager } from '@vibecook/avocado-sdk';

const sessionManager = createPTYSessionManager();
const udsServer = createUDSServer();
udsServer.start({ socketPath: '/tmp/my-app.sock' });

const bridge = createPTYIPCBridge(sessionManager);
bridge.initialize(udsServer);
```

Windows: use a Named Pipe path like `\\\\.\\pipe\\my-app`.

## Wire format

Messages are encoded with **msgpack** for compactness. The same `WS_PTY_MESSAGE_TYPES` discriminator is used as the mesh transport, so the session-management layer doesn't change.
