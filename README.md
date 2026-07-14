# Avocado

[![CI](https://github.com/jamesyong-42/avocado/actions/workflows/ci.yml/badge.svg)](https://github.com/jamesyong-42/avocado/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-live-8fd14f?style=flat)](https://jamesyong-42.github.io/avocado/)
[![npm version](https://img.shields.io/npm/v/@vibecook/avocado-sdk.svg?label=@vibecook/avocado-sdk)](https://www.npmjs.com/package/@vibecook/avocado-sdk)
[![npm version](https://img.shields.io/npm/v/@vibecook/avocado.svg?label=@vibecook/avocado)](https://www.npmjs.com/package/@vibecook/avocado)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Terminal session sync for the web stack — one session model, pluggable transports.

**Avocado** is a TypeScript library for synchronizing terminal (PTY) sessions across processes, machines, and networks. Factor out the plumbing every terminal-UI project rebuilds — PTY spawning, output buffering, resize coordination, one-active-terminal-per-session logic, cross-device focus handoff — and pick the transport(s) you actually need:

- **Local PTY** via `node-pty`
- **IPC** (Unix Domain Socket / Named Pipe) — bridge a CLI to a desktop app
- **Mesh** — cross-device sync over Tailscale via [`@vibecook/truffle`](https://www.npmjs.com/package/@vibecook/truffle)
- **WebSocket** — planned

## Documentation

**Live site:** [jamesyong-42.github.io/avocado](https://jamesyong-42.github.io/avocado/)

| | |
| --- | --- |
| [Guide](https://jamesyong-42.github.io/avocado/) | Install, concepts, quick start, transports |
| [API reference](https://jamesyong-42.github.io/avocado/api.html) | SDK subpaths, React surface, CLI |

## Install

### Library

```sh
pnpm add @vibecook/avocado-sdk
```

Import what you need via subpath exports:

```ts
import { createPTYSessionManager }     from '@vibecook/avocado-sdk';
import { LocalPTYSession }             from '@vibecook/avocado-sdk/node-pty';
import { createUDSServer }             from '@vibecook/avocado-sdk/transport-ipc';
import { PTYMeshBridge }               from '@vibecook/avocado-sdk/transport-truffle';
import { AvocadoProvider, TerminalGrid } from '@vibecook/avocado-sdk/react';
```

Peer deps (`node-pty`, `@vibecook/truffle`, `react`, `xterm`, `three`, …) are **all optional** — install only the ones for the subpaths you import.

### CLI

```sh
npm i -g @vibecook/avocado
avo --help
```

## Packages

| Package                    | Role                                               |
| -------------------------- | -------------------------------------------------- |
| [`@vibecook/avocado-sdk`](https://www.npmjs.com/package/@vibecook/avocado-sdk) | The library. Subpath exports carve out each module |
| [`@vibecook/avocado`](https://www.npmjs.com/package/@vibecook/avocado) | CLI binary (`avo`) |

Inside this monorepo:

| Path                    | What it is                                                |
| ----------------------- | --------------------------------------------------------- |
| `packages/sdk/`         | Source for `@vibecook/avocado-sdk`                        |
| `packages/cli/`         | Source for `@vibecook/avocado`                            |
| `apps/playground/`      | Electron showcase of cross-device mesh sync               |
| `apps/ghostty/`         | Ghostty-parity Electron app on the headless React primitives |
| `docs/`                 | Static docs site deployed to GitHub Pages                 |

## Architecture

```
@vibecook/avocado-sdk
    └── /types               — shared interfaces + protocol types
    └── /                    — PTYSessionManager, TerminalService
    └── /node-pty            — spawn local PTYs
    └── /transport-ipc       — UDS / Named Pipe
    └── /transport-truffle   — Tailscale mesh
    └── /react               — React components, hooks, renderers
```

All transports implement `IPTYTransport`. `PTYSessionManager` consumes them uniformly, so a local PTY, a CLI over IPC, and a remote peer session all look identical to the UI layer.

## Status

**Pre-alpha.** APIs may change before `1.0`. See the [docs](https://jamesyong-42.github.io/avocado/) for the current guide and API reference.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run build
pnpm run playground   # run the Electron demo
pnpm run docs:dev     # serve docs/ at http://localhost:5173
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for commit-message conventions and the release flow.

## License

MIT — see [LICENSE](LICENSE).
