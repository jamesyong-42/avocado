# @vibecook/avocado-sdk

Terminal session sync library — one session model, pluggable transports.

```sh
pnpm add @vibecook/avocado-sdk
```

## Subpath exports

| Import                                         | Peer dep(s) (all optional)                 |
| ---------------------------------------------- | ------------------------------------------ |
| `@vibecook/avocado-sdk`                        | — core + types                             |
| `@vibecook/avocado-sdk/types`                  | —                                          |
| `@vibecook/avocado-sdk/node-pty`               | `node-pty`                                 |
| `@vibecook/avocado-sdk/transport-ipc`          | —                                          |
| `@vibecook/avocado-sdk/transport-truffle`      | `@vibecook/truffle`                        |
| `@vibecook/avocado-sdk/react`                  | `react`, `xterm`, `@xterm/addon-fit`…      |

Install only the peers you need for the subpaths you import.

## Quick example

```ts
import { createPTYSessionManager } from '@vibecook/avocado-sdk';
import { LocalPTYSession }         from '@vibecook/avocado-sdk/node-pty';
import { spawn as ptySpawn }       from 'node-pty';

const sessionManager = createPTYSessionManager();
const session = LocalPTYSession.spawn(
  (opts) => ptySpawn(opts.command, opts.args, opts),
  { command: process.env.SHELL!, args: [], cwd: process.cwd(), cols: 120, rows: 32 },
  { command: 'bash', cwd: process.cwd() }
);
sessionManager.registerSession(session);
```

## Docs

Full guide: <https://jamesyong-42.github.io/avocado/>

Repo + issues: <https://github.com/jamesyong-42/avocado>

## License

MIT
