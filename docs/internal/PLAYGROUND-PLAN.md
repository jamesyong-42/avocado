# Avocado Playground (apps/playground) — v0.1 Plan

**Date**: 2026-04-11
**Goal**: Runnable Electron app demonstrating avocado's full stack — local PTY spawn, terminal rendering, mesh peer discovery, and remote terminal sync via truffle 0.4.0.

## Principle

**Mirror truffle's `examples/playground/`.** It's a proven electron-vite + React 19 reference for consuming `@vibecook/truffle` from Electron. We're building the same shape with avocado's services layered on top. Don't reinvent — adapt.

Reference repo: `/Users/jamesyong/Projects/project100/p008/truffle/examples/playground/`

## Stack

- **electron-vite** (proven with NapiNode in truffle's own playground)
- **electron 35.x**
- **React 19** + TypeScript strict mode
- **node-pty** (native; needs `@electron/rebuild` post-install)
- **@vibecook/truffle ^0.4.0** (NAPI prebuilds; should not need rebuild)
- **@avocado/{types,core,node-pty,transport-truffle,react}** workspace deps
- **xterm + @xterm/addon-fit** (peer deps of @avocado/react, installed in playground)
- Basic inline CSS — no Tailwind for v0.1
- electron-builder NOT included (run via `pnpm dev` only)

## What it demonstrates

1. App launches, truffle node starts, gets a stable ULID `deviceId`
2. Status bar shows local device info + connection state
3. Peers list updates as devices come online via the mesh
4. "Spawn shell" button creates a local PTY session
5. Local PTY renders in a terminal grid using `@avocado/react` `<VirtualTerminal>`
6. You can type into the terminal and see live output
7. The session announces itself to the mesh via `PTYSyncStore`
8. A second instance on another device sees the announcement and shows the remote session in its sessions list
9. Clicking a remote session subscribes to it; output streams to your screen
10. Typing into a remote session sends input back to the owner

## File layout

```
apps/playground/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json            # Solution config (references node + web)
├── tsconfig.node.json       # Main + preload + shared
├── tsconfig.web.json        # Renderer
├── README.md
└── src/
    ├── main/
    │   ├── index.ts                 # Electron lifecycle, BrowserWindow
    │   ├── avocado-manager.ts       # Top-level orchestrator
    │   ├── pty-spawner.ts           # node-pty wrapper (LocalPTYSession.spawn)
    │   ├── proxy-pty-session.ts     # IPTYSession over MeshPTYTransport
    │   ├── ipc-handlers.ts          # ipcMain wiring
    │   └── notifier.ts              # IPeerNotifier → BrowserWindow.send
    ├── preload/
    │   └── index.ts                 # contextBridge.exposeInMainWorld('avocado', ...)
    ├── shared/
    │   └── ipc.ts                   # Typed IPC contract (single source of truth)
    └── renderer/
        ├── index.html
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── electron-backend.ts  # TerminalBackend impl wrapping window.avocado
            ├── components/
            │   ├── DeviceInfo.tsx
            │   ├── PeersList.tsx
            │   ├── SessionsList.tsx
            │   └── TerminalCanvas.tsx
            └── styles.css
```

## Architecture

```
┌────────────────────────── Renderer (Chromium) ─────────────────────────┐
│                                                                        │
│   <AvocadoProvider backend={electronBackend}>                          │
│     <DeviceInfo />  <PeersList />  <SessionsList />                    │
│     <TerminalCanvas /> ← uses VirtualTerminal from @avocado/react      │
│                                                                        │
│   electronBackend = TerminalBackend impl that calls window.avocado.*   │
│                                                                        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ contextBridge IPC
┌──────────────────────────────────▼─────────────────────────────────────┐
│                              Preload                                   │
│   exposeInMainWorld('avocado', { lifecycle, peers, pty, terminal })    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ ipcMain.handle / webContents.send
┌──────────────────────────────────▼─────────────────────────────────────┐
│                          Main process (Node)                           │
│                                                                        │
│   AvocadoManager                                                       │
│   ├── createMeshNode({ appId: 'avocado-playground', deviceName, ... }) │
│   ├── createPTYSessionManager()                                        │
│   │     └── setProxySessionFactory(createProxyPTYSession)              │
│   ├── new TerminalServiceImpl(sessionManager)                          │
│   ├── new PTYMeshBridge({ node, sessionManager })                      │
│   ├── new PTYSyncStore({ node })                                       │
│   └── new RemoteSessionService({                                       │
│         node, sessionManager, bridge, syncStore,                       │
│         notifier: ipcNotifier                                          │
│       })                                                               │
│                                                                        │
│   Local PTY:  pty-spawner.ts → LocalPTYSession.spawn(node-pty.spawn)   │
│   Proxy PTY:  proxy-pty-session.ts → BasePTYSession + transport ops    │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## IPC contract

The IPC contract is essentially `@avocado/types/TerminalBackend` + lifecycle/peer methods. The renderer wraps `window.avocado.{pty,terminal}` into a `TerminalBackend` and passes it to `<AvocadoProvider>`. This means the existing avocado/react components work without modification.

```ts
export interface AvocadoAPI {
  // Lifecycle
  lifecycle: {
    start(): Promise<NodeIdentity>;
    stop(): Promise<void>;
    getStatus(): Promise<NodeStatus>;
    onStatusChanged(cb: (status: NodeStatus) => void): Unsubscribe;
    onAuthRequired(cb: (url: string) => void): Unsubscribe;
  };

  // Peers
  peers: {
    list(): Promise<PeerInfo[]>;
    onChanged(cb: (peers: PeerInfo[]) => void): Unsubscribe;
  };

  // PTY (matches TerminalBackend.pty 1:1 — see @avocado/types/backend.ts)
  pty: {
    create(opts): Promise<{ success: boolean; sessionId?: string; error?: string }>;
    destroy(sessionId): Promise<{ success: boolean; error?: string }>;
    list(): Promise<{ success: boolean; sessions?: PtySessionInfo[]; error?: string }>;
    write(sessionId, data): Promise<void>;
    resize(sessionId, cols, rows): Promise<{ success: boolean; error?: string }>;
    onOutput(cb): Unsubscribe;
    onExit(cb): Unsubscribe;
    onSessionDiscovered(cb): Unsubscribe;
    onSessionLost(cb): Unsubscribe;
    onSessionResized(cb): Unsubscribe;
  };

  // Terminals (matches TerminalBackend.terminal 1:1)
  terminal: {
    createVirtual(sessionId, opts): Promise<{ success; terminalId?; error? }>;
    destroy(terminalId): Promise<{ success; error? }>;
    list(): Promise<{ success; terminals?; error? }>;
    resize(terminalId, cols, rows): Promise<{ success; error? }>;
    setActive(terminalId): Promise<{ success; error? }>;
    onDestroyed(cb): Unsubscribe;
  };
}
```

## Phase plan

### Phase A — Scaffold (no logic)
1. `apps/playground/package.json` with full dep list
2. `electron.vite.config.ts` mirroring truffle playground's
3. `tsconfig.{json,node,web}.json` mirroring truffle playground's
4. `index.html`, `main.tsx` that renders "Hello playground"
5. Basic `main/index.ts` that opens a `BrowserWindow`
6. **Verify**: `pnpm -F @avocado-playground/desktop dev` launches an Electron window with "Hello"

### Phase B — Truffle wiring (main process only)
7. `avocado-manager.ts` — start truffle node only (no avocado services yet)
8. `shared/ipc.ts` — define lifecycle channels
9. `main/ipc-handlers.ts` — expose lifecycle.start/stop/getStatus
10. `preload/index.ts` — bridge to renderer
11. `App.tsx` — call lifecycle.start, show device info
12. **Verify**: launch app → truffle starts → device info visible in UI

### Phase C — Local PTY
13. `pty-spawner.ts` — wraps `node-pty` via `LocalPTYSession.spawn(...)`
14. Extend `avocado-manager.ts` — instantiate PTYSessionManager + TerminalServiceImpl
15. Extend `shared/ipc.ts` and `ipc-handlers.ts` — wire pty.* and terminal.* IPC
16. `electron-backend.ts` — TerminalBackend impl wrapping `window.avocado`
17. Extend `App.tsx` — `<AvocadoProvider>` + a `<VirtualTerminal>` from @avocado/react
18. "Spawn shell" button → creates a session + virtual terminal → renders
19. **Verify**: button click → terminal renders → typing works → output streams

### Phase D — Mesh integration
20. `proxy-pty-session.ts` — `IPTYSession` over a `MeshPTYTransport`
21. Extend `avocado-manager.ts` — wire `PTYMeshBridge`, `PTYSyncStore`, `RemoteSessionService`
22. `notifier.ts` — `IPeerNotifier` impl that forwards to `webContents.send`
23. Extend `ipc-handlers.ts` — peers.list, peers.onChanged
24. Extend `App.tsx` — render `PeersList`, `SessionsList` (local + remote)
25. **Verify** with two instances: peer appears, remote session shows up, can subscribe

### Phase E — README + commit
26. `apps/playground/README.md` — setup, dev, run instructions
27. `pnpm -C avocado build` from root must exit 0 (workspace TS check still works)
28. `pnpm -C avocado/apps/playground typecheck` must exit 0
29. Single commit, message describes the full v0.1 scope

## Critical risks

### Risk 1: node-pty native rebuild for Electron
node-pty has a native C++ binding compiled against Node.js. Electron uses its own bundled Node, so the binding must be rebuilt against Electron's headers. Add `@electron/rebuild` as a devDependency and run it in `postinstall`. Without this, `import nodePty from 'node-pty'` in main throws `NODE_MODULE_VERSION` mismatch at runtime. Update `pnpm-workspace.yaml`'s `onlyBuiltDependencies` or use `pnpm approve-builds`.

### Risk 2: @vibecook/truffle sidecar binary executable
The sidecar is a Go binary at `node_modules/@vibecook/truffle-sidecar-darwin-arm64/bin/...`. Truffle's `f3c8077` made the install script chmod +x it, but pnpm's "ignored build scripts" warning means the script needs explicit approval. Document `pnpm approve-builds @vibecook/truffle` in README setup.

### Risk 3: electron-vite preload path
electron-vite emits preload as `.mjs` by default but Electron's `BrowserWindow.webPreferences.preload` expects a path with the right extension. Truffle's playground hit this exact bug (`bc05574 fix(examples): preload path mismatch`). **Mirror their fix** in `electron.vite.config.ts`.

### Risk 4: TerminalServiceImpl missing createHeadlessTerminal
`@avocado/core`'s `TerminalServiceImpl` only implements `createVirtualTerminal`. The `@avocado/types/TerminalBackend.terminal` interface declares both `createVirtual` and `createHeadless`. The playground only needs virtual terminals — implement `terminal.createVirtual` properly and have `terminal.createHeadless` return `{ success: false, error: 'not implemented' }`. **Do not add headless support to core** — out of scope.

### Risk 5: ProxyPTYSession dependency boundaries
`proxy-pty-session.ts` extends `BasePTYSession` from `@avocado/types`. It must NOT import from `@avocado/core` — the factory passed to `setProxySessionFactory` should only need types + the transport instance.

### Risk 6: Don't add playground to root tsconfig.json references
Root `tsconfig.json` uses TS project references for the workspace **packages**. `apps/playground` is a standalone consumer with its own electron-vite typecheck pipeline — adding it to the root references would conflict. **Leave the root tsconfig alone.**

### Risk 7: Renderer can't import Node-only packages
- ✓ `@avocado/types` — pure TypeScript types, fine in renderer
- ✓ `@avocado/react` — React components, fine in renderer
- ✗ `@avocado/core` — Node only (uses `events`, `crypto`, `randomUUID`)
- ✗ `@avocado/node-pty` — native binding, main process only
- ✗ `@avocado/transport-truffle` — main process only (truffle native binding)
- ✗ `@vibecook/truffle` — main process only

If the agent accidentally imports a Node package from the renderer, the bundle build will explode. Keep imports clean.

### Risk 8: Existing apps/playground stub
There's already a `apps/playground/package.json` and `README.md` from the repositioning batch. They're stubs (no source). The agent should overwrite/extend them — not delete + recreate (which would lose git history of those files).

## Out of scope for v0.1

- Authentication UI (truffle's `openUrl` opens the browser; that's enough)
- Tailwind / styling polish
- File transfer
- SyncedStore inspection panel
- Health polling
- Settings persistence
- electron-builder packaging
- Multiple BrowserWindows
- WebGL CRT effects (basic xterm renderer is fine)
- Tests
- Window state persistence
- Cross-platform testing beyond darwin (the dev environment)
