# `@avocado-playground/desktop`

Electron showcase app for [`avocado`](../../README.md). Demonstrates the full
stack end-to-end: local PTY spawning, in-app terminal rendering, mesh peer
discovery via [`@vibecook/truffle`](https://www.npmjs.com/package/@vibecook/truffle),
and cross-device terminal sync.

This app does **not** ship as a packaged binary — it's a reference
implementation and a development harness. Run it with `pnpm dev`.

## What it demonstrates

1. App launches, truffle node starts, gets a stable ULID `deviceId`.
2. The header shows the local device identity + lifecycle state.
3. A peers panel updates as devices come online via the mesh.
4. **Spawn shell** creates a local PTY via `node-pty` inside the main
   process.
5. **CLI sync** — run `avo bash` (or `avo claude`, etc.) in an external
   terminal and the session appears in the playground via UDS/Named Pipe.
6. The local session announces itself to the mesh via `PTYSyncStore`.
6. A sessions panel lists every session (local + discovered remote).
7. Selecting a session attaches a `VirtualTerminal` from `@avocado/react` —
   the xterm.js frontend talks to the main process through IPC.
8. Typing works, resize works, remote sessions (from a second instance on
   the same tailnet) stream output over the mesh.

## Architecture

```
┌──────────────────────── Renderer (Chromium) ──────────────────────────────┐
│                                                                            │
│   <AvocadoProvider backend={electronBackend}>                              │
│     <Header /> <PeersList /> <SessionsList /> <VirtualTerminal />          │
│                                                                            │
│   electronBackend = TerminalBackend impl calling window.avocado.{pty,*}    │
│                                                                            │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       │ contextBridge (preload/index.ts)
┌──────────────────────────────────────▼─────────────────────────────────────┐
│                             Main (Node / Electron)                         │
│                                                                            │
│   AvocadoManager                                                           │
│   ├── createMeshNode({ appId: 'avocado-playground', ... })                 │
│   ├── createPTYSessionManager()                                            │
│   │     └── setProxySessionFactory(createProxyPTYSession)                  │
│   ├── createTerminalService(sessionManager)                                │
│   ├── createUDSServer() → ~/.avocado/playground.sock                       │
│   ├── createPTYIPCBridge(sessionManager) → bridge.initialize(udsServer)    │
│   ├── new PTYMeshBridge({ node, sessionManager })                          │
│   ├── new PTYSyncStore({ node })                                           │
│   └── new RemoteSessionService({                                           │
│         node, sessionManager, bridge, syncStore, notifier: ipcNotifier     │
│       })                                                                   │
│                                                                            │
│   Local PTY  → pty-spawner.ts + LocalPTYSession.spawn(node-pty.spawn)      │
│   CLI PTY    → UDSServer + PTYIPCBridge (sessions from `avo` command)      │
│   Remote PTY → proxy-pty-session.ts on top of MeshPTYTransport             │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## File layout

```
apps/playground/
├── electron.vite.config.ts   # Main/preload/renderer Vite configs
├── package.json
├── README.md
├── tsconfig.json             # Solution config (references node + web)
├── tsconfig.node.json        # Main + preload + shared
├── tsconfig.web.json         # Renderer
└── src/
    ├── main/
    │   ├── index.ts                 # Electron lifecycle, BrowserWindow
    │   ├── avocado-manager.ts       # Top-level orchestrator
    │   ├── pty-spawner.ts           # node-pty wrapper → PTYSpawnFunction
    │   ├── proxy-pty-session.ts     # IPTYSession over IPTYTransport
    │   ├── ipc-handlers.ts          # ipcMain wiring + event forwarding
    │   └── notifier.ts              # IPeerNotifier stub for v0.1
    ├── preload/
    │   └── index.ts                 # contextBridge('avocado', ...)
    ├── shared/
    │   └── ipc.ts                   # Typed IPC contract (single source of truth)
    └── renderer/
        ├── index.html
        └── src/
            ├── main.tsx             # React 19 entry
            ├── App.tsx              # Root component
            ├── window.d.ts          # window.avocado ambient typing
            ├── electron-backend.ts  # TerminalBackend adapter
            ├── styles.css
            └── components/
                ├── PeersList.tsx
                └── SessionsList.tsx
```

## Setup

```bash
# From the workspace root
pnpm install
```

### pnpm approve-builds

pnpm 10 blocks install scripts by default. The playground needs two of
them to run for the app to work:

```bash
pnpm approve-builds
# Allow: electron, esbuild
```

Separately, `node-pty` must be rebuilt against Electron's Node ABI so its
native binding matches. This runs automatically via the playground's
`postinstall` script (`electron-rebuild -f -w node-pty`), provided
`@electron/rebuild` is available. If you see `NODE_MODULE_VERSION` errors
at runtime, re-run install:

```bash
pnpm install
```

## Run

```bash
pnpm -C apps/playground dev
```

On first launch truffle will ask you to authenticate the device on your
tailnet — the playground opens the auth URL in your default browser via
`shell.openExternal()`. Subsequent launches reuse the persisted ULID from
`$userData/truffle-state/avocado-playground/<hostname>/`.

### Build

```bash
pnpm -C apps/playground build
```

Produces `out/{main,preload,renderer}/`. The playground does **not**
ship electron-builder packaging in v0.1 — run it via `pnpm dev`.

### Typecheck

```bash
pnpm -C apps/playground typecheck
```

Runs both the node-side and renderer-side TS configs in strict mode.

## v0.1 scope

**Supported:**

- Local PTY spawning + rendering via xterm.js
- CLI session sync via `@avocado/cli` (`avo` command) over UDS/Named Pipe
- Truffle mesh lifecycle (start, stop, auth URL handoff to the OS browser)
- Peer discovery
- Cross-device session announcement via `PTYSyncStore`
- Remote session consumption via `PTYMeshBridge` + `RemoteSessionService`
- Typed IPC contract that 1:1 mirrors `@avocado/types/TerminalBackend`

**Out of scope (not yet supported):**

- Authentication UI beyond the auth URL hand-off
- File transfer (truffle's `fileTransfer()` is unused)
- SyncedStore inspection panel
- Health polling / diagnostics
- Cooperative focus handoff between devices
- Settings persistence
- electron-builder packaging
- Multiple `BrowserWindow`s
- ~~WebGL CRT path~~ (removed; future effects via restty shaders if needed)
- Optional **restty** engine (libghostty-vt) via grid Engine toggle
- Cross-platform testing beyond darwin
- Tests
- Headless terminals (the `terminal.createHeadless` IPC handler returns
  `{ success: false, error: '...not implemented in playground v0.1' }`;
  `TerminalServiceImpl` only implements `createVirtualTerminal`.)
