# Install

## Library (SDK)

```sh
pnpm add @vibecook/avocado-sdk
# or
npm i @vibecook/avocado-sdk
```

Then install the **peer dependencies** for the subpaths you actually use. All peers are optional.

| Subpath                                 | Required peer(s)                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@vibecook/avocado-sdk`                 | *(none)* — core session manager + types only                                                       |
| `@vibecook/avocado-sdk/node-pty`        | `node-pty`                                                                                         |
| `@vibecook/avocado-sdk/transport-ipc`   | *(none)* — uses built-in Node networking                                                           |
| `@vibecook/avocado-sdk/transport-truffle` | `@vibecook/truffle`                                                                              |
| `@vibecook/avocado-sdk/react`           | `react`, `xterm`, `@xterm/addon-fit` (WebGL renderer adds `three`, `@react-three/fiber`, `postprocessing`) |

Example — server-side app using local PTY + mesh sync:

```sh
pnpm add @vibecook/avocado-sdk node-pty @vibecook/truffle
```

## CLI

```sh
npm i -g @vibecook/avocado
avo --help
```

The CLI requires `node-pty`, which npm will build on your machine during install.

## Supported runtimes

- Node.js ≥ 18 (library + CLI)
- Modern browsers (React subpath, no server-only APIs)
- Electron (tested — playground app is Electron)
