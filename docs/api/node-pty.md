# `@vibecook/avocado-sdk/node-pty`

Local PTY source. **Peer dep: `node-pty`.**

```ts
import { LocalPTYSession, type PTYSpawnFunction, type IPty } from '@vibecook/avocado-sdk/node-pty';
import { spawn as ptySpawn } from 'node-pty';

const spawnFn: PTYSpawnFunction = (opts) => ptySpawn(opts.command, opts.args, opts);

const session = LocalPTYSession.spawn(
  spawnFn,
  { command: '/bin/bash', args: [], cwd: process.cwd(), cols: 120, rows: 32 },
  { command: 'bash', cwd: process.cwd() }
);
```

`LocalPTYSession` implements `IPTYSession` and emits `output`, `exit`, `resized` events that flow through the `PTYSessionManager`.
