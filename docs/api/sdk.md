# `@vibecook/avocado-sdk`

The flagship entry — re-exports the `core` session-management surface and shared `types`.

```ts
import {
  createPTYSessionManager,
  PTYSessionManager,
  createTerminalService,
  TerminalServiceImpl,
  createTerminalStoreSync,
  getOriginalId,
  WS_PTY_MESSAGE_TYPES,
} from '@vibecook/avocado-sdk';
```

## Subpaths

| Import path                                  | Module                                              |
| -------------------------------------------- | --------------------------------------------------- |
| `@vibecook/avocado-sdk`                      | Core + types (this page)                            |
| `@vibecook/avocado-sdk/types`                | [Types](/api/types)                                 |
| `@vibecook/avocado-sdk/node-pty`             | [Local PTY](/api/node-pty)                          |
| `@vibecook/avocado-sdk/transport-ipc`        | [IPC transport](/api/transport-ipc)                 |
| `@vibecook/avocado-sdk/transport-truffle`    | [Mesh transport](/api/transport-truffle)            |
| `@vibecook/avocado-sdk/react`                | [React components](/api/react)                      |

Each subpath's peer dependencies are **optional at the package level** — install only the ones for the subpaths you import.
