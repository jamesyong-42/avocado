# Local PTY

Use `LocalPTYSession.spawn` with a `node-pty` spawner. The session registers with `PTYSessionManager` just like any other.

```ts
import { LocalPTYSession } from '@vibecook/avocado-sdk/node-pty';
import { spawn as ptySpawn } from 'node-pty';

const session = LocalPTYSession.spawn(
  (opts) => ptySpawn(opts.command, opts.args, opts),
  { command: process.env.SHELL!, args: [], cwd: process.cwd(), cols: 120, rows: 32 },
  { command: 'bash', cwd: process.cwd() }
);
sessionManager.registerSession(session);
```
