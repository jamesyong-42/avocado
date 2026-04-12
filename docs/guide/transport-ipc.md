# IPC Transport

Lets a CLI client connect to a host process (typically an Electron or server app) and share PTY sessions through a **Unix Domain Socket** (macOS/Linux) or **Named Pipe** (Windows).

```ts
import { createUDSServer, createPTYIPCBridge } from '@vibecook/avocado-sdk/transport-ipc';

const udsServer = createUDSServer();
udsServer.start({ socketPath: '/tmp/my-app.sock' });

const bridge = createPTYIPCBridge(sessionManager);
bridge.initialize(udsServer);
```

A CLI session that connects to this socket appears in `PTYSessionManager` with `source: 'ipc'`.
