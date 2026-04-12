# Truffle Mesh Port Plan (revised)

**Date**: 2026-04-10
**Truffle version**: `@vibecook/truffle@^0.4.0` *(originally drafted against 0.3.24; migrated to 0.4.0 / RFC 017 on 2026-04-11 — see commit log)*
**Scope**: Port vibe-ctl's PTY mesh-sync code into `@avocado/transport-truffle`, using truffle directly — no abstraction layers.

## Principle

**Rely on truffle, don't build extra wheels.** Import `@vibecook/truffle` directly, use its types (`NapiNode`, `NapiPeer`, `NapiNamespacedMessage`, `NapiPeerEvent`, `NapiStoreEvent`). Do **not** create custom `IMeshNode` / `IMessageBus` / `wire-protocol` abstractions. Let truffle do the serialization work.

## Why this supersedes the earlier plan

1. Truffle v0.3.24 (released 2026-04-10) fixed the npm publish pipeline. `pnpm add @vibecook/truffle` works cleanly from npm now — the `workspace:*` → concrete version rewrite happens at publish time.
2. Truffle's new `examples/playground/` is a complete reference for Electron integration we can model after.
3. Truffle's `SyncedStore` primitive (RFC 016, shipped in 0.3.17) is exactly what vibe-ctl's `SessionStoreSync` was building by hand. We drop the custom port and use the native primitive.
4. `NapiNode.onMessage` **already decodes JSON payloads at the NAPI boundary**. No manual encode/decode helper needed — just `JSON.stringify` on send, cast on receive.

## Key truffle API patterns (v0.3.24)

### Node creation
```ts
import { createMeshNode, type NapiNode } from '@vibecook/truffle';
import { shell } from 'electron';

const node = await createMeshNode({
  name: 'my-device',
  openUrl: (url) => shell.openExternal(url),
  onAuthRequired: (url) => { /* surface to UI */ },
  onPeerChange: (event) => { /* joined/left/ws_connected/ws_disconnected */ },
});
```

### Messaging
```ts
// Send — payload is a Buffer (JSON.stringify works)
await node.send(peerId, 'pty', Buffer.from(JSON.stringify({ type: 'input', sessionId, data })));
await node.broadcast('pty', Buffer.from(JSON.stringify({ type: 'sessionList', sessions })));

// Receive — msg.payload is ALREADY JSON-decoded on the receive side
node.onMessage('pty', (msg: NapiNamespacedMessage) => {
  const typed = msg.payload as PTYMessage;  // plain object, NOT a Buffer
  // msg.from, msg.timestamp also available
});
```

### Peer events
```ts
node.onPeerChange((event: NapiPeerEvent) => {
  // event.eventType: 'joined' | 'left' | 'ws_connected' | 'ws_disconnected' | 'updated' | 'auth_required'
  // event.peerId, event.peer (NapiPeer: { id, name, ip, online, wsConnected, connectionType, ... })
});
```

### SyncedStore (for session discovery)
```ts
const store = node.syncedStore<PTYSessionsSlice>('avocado-pty-sessions');
await store.set({ sessions: [...], updatedAt: Date.now() });
const slices = await store.all();  // NapiSlice<PTYSessionsSlice>[] — local + all remotes
store.onChange((event: NapiStoreEvent) => {
  // event.eventType: 'local_changed' | 'peer_updated' | 'peer_removed'
  // event.deviceId, event.version
});
```

## Design decisions

- **D1 Direct import.** `@avocado/transport-truffle` takes `@vibecook/truffle@^0.3.24` as a regular dependency. Use `NapiNode`, `NapiPeer`, etc. directly. No abstraction layer.
- **D2 No wire-protocol module.** Send JS objects via `Buffer.from(JSON.stringify(obj))`. Receive via `msg.payload` (already decoded). No custom encode/decode.
- **D3 Single `'pty'` namespace.** All PTY messages share one namespace; `type` field inside the payload discriminates. Reuse `WS_PTY_MESSAGE_TYPES` from `@avocado/types`.
- **D4 SyncedStore for session discovery.** Each device writes its local session list into `syncedStore('avocado-pty-sessions')`. Peers observe `onChange` and reconcile proxy sessions. Replaces vibe-ctl's custom `SessionStoreSync`.
- **D5 Cooperative focus.** No conflict resolution in v0.1 — last write wins.
- **D6 `IPeerNotifier` injected interface.** Replaces `BrowserWindow.webContents.send()` coupling. Electron consumers wire it; headless passes nothing.
- **D7 Out of scope for v0.1:** primary election, focus conflict resolution, `forwardFocusToCli`, remote `spawn()`/`CREATE_SESSION` path.
- **D8 Playground blueprint.** `apps/playground` (separate phase) will mirror truffle playground's architecture: electron-vite + React 19 + main-process `TruffleManager`-style class + typed IPC contract in `shared/ipc.ts`.

## Work breakdown

### Phase A — Package wiring (prep, DONE before implementation agent spawn)
- Add `"@vibecook/truffle": "^0.3.24"` to `packages/transport-truffle/package.json` dependencies
- Run `pnpm install` from repo root, verify resolution
- Commit as build-infrastructure change

### Phase B — Rewrite MeshPTYTransport
`packages/transport-truffle/src/mesh-pty-transport.ts` (REWRITE):
- Constructor: `{ node: NapiNode, peerId: string, peerName?: string }`
- Drop the custom `IMessageBus` interface entirely
- Use `node.send(peerId, 'pty', Buffer.from(JSON.stringify(...)))` for sends
- Handle incoming via `node.onMessage('pty', ...)` subscription at construction time, filtering by `msg.from === this.peerId`
- Still implements `IPTYTransport` from `@avocado/types` (same events: output, resized, sessionAnnounced, sessionEnded, focusChanged, etc.)
- Preserve the public surface (sendInput, sendResize, sendKill, sendFocus, subscribe, unsubscribe, handleConnected, handleDisconnected)
- `transportType` remains `'ws'`; `transportId` is the truffle peer ID

### Phase C — Port RelaySessionManager
`packages/transport-truffle/src/relay-session-manager.ts` (NEW):
- Port from `p008-claude-on-the-go/.../pty/remote-sessions/relay-session-manager.ts`
- Replace `@claude-code-on-the-go/shared` imports with `@avocado/types`
- `ITerminalStoreSync` comes from `@avocado/core` (no aliasing — commit c119160 unified this)
- Accept the rewritten `MeshPTYTransport` as the transport type
- Public API: `createRelay`, `getRelay`, `hasRelay`, `disposeRelay`, `getRelaysForSession`, `cleanupForDevice`, `dispose`
- Events: `relayCreated`, `relayDisposed`

### Phase D — Session discovery via SyncedStore
`packages/transport-truffle/src/pty-sync-store.ts` (NEW):
- Define `PTYSessionsSlice` type: `{ sessions: RemoteSessionAnnounce[]; updatedAt: number }`
- Wraps `node.syncedStore<PTYSessionsSlice>('avocado-pty-sessions')`
- Public API: `setLocalSessions(sessions)`, `getLocalSessions()`, `getRemoteSessions()`, `getAllSlices()`, `onRemoteChange(callback)`, `dispose`
- Replaces vibe-ctl's `SessionStoreSync` with truffle's native primitive

### Phase E — Port PTYMeshBridge
`packages/transport-truffle/src/pty-mesh-bridge.ts` (NEW):
- Port from `p008-claude-on-the-go/.../pty/bridges/pty-mesh-bridge.ts`, rewired for new API
- Constructor: `{ node: NapiNode, sessionManager: PTYSessionManager }`
- Uses `node.onPeerChange` to detect `ws_connected` / `ws_disconnected`, creating/disposing one `MeshPTYTransport` per peer
- Registers transports with `PTYSessionManager` on connect; unregisters on disconnect
- Public API: `initialize`, `getTransportCount`, `getTransport(peerId)`, `getTransports()`, `dispose`

### Phase F — Port RemoteSessionService (slim)
`packages/transport-truffle/src/remote-session-service.ts` (NEW):
- Port from `p008-claude-on-the-go/.../pty/remote-sessions/remote-session-service.ts` (~815 LOC → ~400 LOC target)
- Constructor: `{ node: NapiNode, sessionManager: PTYSessionManager, bridge: PTYMeshBridge, syncStore: PTYSyncStore, notifier?: IPeerNotifier }`
- Define `IPeerNotifier` interface: `sessionFocusChanged(sessionId, focused, source, deviceId?)`, `remoteSessionsChanged(deviceId, count)`
- Subscribe to `'pty'` namespace via `node.onMessage('pty', ...)` at `enable()`
- Dispatch by `payload.type`:
  - Viewer→Owner: SUBSCRIBE, UNSUBSCRIBE, INPUT, RESIZE, KILL, FOCUS_CHANGED
- Use `syncStore` for session list announcement + reconciliation
- Notify via `notifier?.sessionFocusChanged(...)` instead of `BrowserWindow`
- DELETE: `forwardFocusToCli`, `handleCreateSession`, `spawn()` path, primary election, focus conflict resolution, `BrowserWindow` references

### Phase G — Barrel + README + build + commit
- Update `packages/transport-truffle/src/index.ts` — export all new public symbols
- Update `packages/transport-truffle/README.md` — mark all files ✓, add minimal usage example
- `pnpm build` — must exit 0
- `pnpm typecheck` — must exit 0
- Single commit

## Non-goals

- Runtime abstractions over truffle (no `IMeshNode`, `IMessageBus`, wire-protocol)
- Electron playground app (`apps/playground`) — separate phase
- Tests (later, with the playground)
- Changes to `@avocado/types` or `@avocado/core` beyond what's strictly required
- `spawn()` helper on `PTYSessionManager` — remote creation stays out of scope

## Reference files

### Source (read-only)
- `p008-claude-on-the-go/packages/desktop/src/main/services/foundation/pty/remote-sessions/relay-session-manager.ts`
- `p008-claude-on-the-go/packages/desktop/src/main/services/foundation/pty/remote-sessions/remote-session-service.ts`
- `p008-claude-on-the-go/packages/desktop/src/main/services/foundation/pty/bridges/pty-mesh-bridge.ts`
- `truffle/examples/playground/src/main/truffle-manager.ts` — current-API reference
- `truffle/packages/core/src/` — truffle's TS types

### Target (write)
- `packages/transport-truffle/src/mesh-pty-transport.ts` (REWRITE)
- `packages/transport-truffle/src/relay-session-manager.ts` (NEW)
- `packages/transport-truffle/src/pty-mesh-bridge.ts` (NEW)
- `packages/transport-truffle/src/pty-sync-store.ts` (NEW)
- `packages/transport-truffle/src/remote-session-service.ts` (NEW)
- `packages/transport-truffle/src/index.ts` (UPDATE)
- `packages/transport-truffle/README.md` (UPDATE)
