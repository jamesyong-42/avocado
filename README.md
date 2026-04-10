# Avocado

> Terminal session sync for the web stack — one session model, four transports.

**Avocado** is a library for synchronizing terminal (PTY) sessions across processes, machines, and networks. It provides a unified session model that works whether you're:

- Spawning a local PTY in Node.js via `node-pty`
- Bridging a CLI to a desktop app over **IPC** (Unix Domain Socket / Named Pipe)
- Connecting browser clients to a server over **WebSocket** *(planned)*
- Syncing terminals between devices over a **mesh** via truffle (Tailscale)

## Why

Every terminal-UI project ends up rebuilding the same plumbing: PTY spawning, output buffering, resize coordination, one-active-terminal-per-session logic, cross-device focus handoff. Avocado factors that into a reusable core and lets you pick the transport(s) you actually need.

## Packages

| Package | Role | Runtime |
|---------|------|---------|
| `@avocado/types` | Shared types, interfaces, base classes | Any |
| `@avocado/core` | `PTYSessionManager`, `TerminalService`, `TerminalStoreSync` | Node |
| `@avocado/node-pty` | Local PTY source (peer dep: `node-pty`) | Node |
| `@avocado/transport-ipc` | UDS / Named Pipe transport | Node |
| `@avocado/transport-truffle` | Mesh transport (peer dep: `@vibecook/truffle`) | Node |
| `@avocado/react` | React components, hooks, xterm.js + WebGL renderers | Browser |

## Apps

| App | Purpose |
|-----|---------|
| `apps/playground` | Electron showcase of mesh terminal sync via truffle |

## Dependency graph

```
@avocado/types  (zero deps)
    │
    ├── @avocado/core
    │       ├── @avocado/node-pty            (local PTY)
    │       ├── @avocado/transport-ipc       (UDS / Named Pipe)
    │       └── @avocado/transport-truffle   (mesh via truffle)
    │
    └── @avocado/react  (browser UI)
```

All transports implement `IPTYTransport`. `PTYSessionManager` consumes them uniformly, so a local PTY, a CLI over IPC, and a mesh peer all look identical to the UI layer.

## Status

**Pre-alpha.** Extracted from vibe-ctl; undergoing refactor. See `docs/IMPLEMENTATION-PLAN.md` for the original extraction plan — some sections are now stale as transports have moved out of `@avocado/core` into dedicated packages.

## License

TBD
