# @avocado/transport-truffle

Mesh transport for [avocado](../../README.md) — cross-device terminal session sync over Tailscale via [truffle](https://www.npmjs.com/package/@vibecook/truffle).

## Status

**Ported from vibe-ctl.** All core mesh-sync pieces are in place.

| Layer | File | Status |
|-------|------|--------|
| Transport | `src/mesh-pty-transport.ts` | ✓ Complete (rewritten against NapiNode) |
| Relay manager | `src/relay-session-manager.ts` | ✓ Complete |
| Sync store | `src/pty-sync-store.ts` | ✓ Complete (uses truffle SyncedStore) |
| Mesh bridge | `src/pty-mesh-bridge.ts` | ✓ Complete |
| Service | `src/remote-session-service.ts` | ✓ Complete (slimmed, Electron-free) |

### Out of scope for v0.1

- Remote session spawning (`CREATE_SESSION` returns `CREATE_FAILED`)
- Primary device election / focus conflict resolution (cooperative: last write wins)
- IPC-to-CLI focus forwarding (the vibe-ctl `forwardFocusToCli` path)
- `BrowserWindow` / Electron-specific wiring (replaced by `IPeerNotifier`)

## Dependency

Depends on `@vibecook/truffle@^0.3.24` as a regular dependency. Truffle bundles its own native Rust NAPI binary and Go sidecar — no manual wiring required on the consumer side.

## Architecture

```
                ┌─────────────────────────┐
                │  RemoteSessionService   │  owner-side dispatch,
                │  (orchestrator)         │  relay bookkeeping,
                └──────────┬──────────────┘  sync-store reconciliation
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
┌────────▼─────┐  ┌────────▼────────┐  ┌─────▼───────┐
│ PTYMeshBridge│  │  PTYSyncStore   │  │ RelaySession│
│              │  │                 │  │  Manager    │
└──────┬───────┘  └─────────┬───────┘  └─────────────┘
       │                    │
       │  onPeerChange      │  syncedStore('avocado-pty-sessions')
       │                    │
┌──────▼──────────────────────────────────┐
│             @vibecook/truffle           │
│          (NapiNode + SyncedStore)       │
└─────────────────────────────────────────┘
```

- **MeshPTYTransport** — one per peer; implements `IPTYTransport`. Subscribes to `node.onMessage('pty', ...)` once and filters by `msg.from === peerId`. Sends via `node.send(peerId, 'pty', Buffer)` with the `WS_PTY_MESSAGE_TYPES` discriminator in the JSON payload.
- **PTYMeshBridge** — owns transport lifecycle: creates a transport on each `ws_connected`, tears it down on `ws_disconnected`. Registers transports with `PTYSessionManager` so the session manager can route `sessionAnnounced` / `sessionEnded` through them.
- **PTYSyncStore** — wraps `node.syncedStore('avocado-pty-sessions')`. Each device writes its shareable session list as a slice; peers observe `onChange` (`peer_updated` / `peer_removed`) to discover sessions without custom broadcasts.
- **RelaySessionManager** — inline `RelayPTYSession` forwarders that copy `output` / `resized` / `exit` from a local source session to a viewer's transport via the owner-side `sendOutput` / `sendResized` / `sendSessionEnded` methods. One relay per (sessionId, viewerPeerId) pair.
- **RemoteSessionService** — subscribes to the `'pty'` namespace, dispatches owner-side commands (`SUBSCRIBE`, `INPUT`, `RESIZE`, `KILL`, `FOCUS_CHANGED`), reconciles proxy sessions against `PTYSyncStore` slices, and surfaces focus / discovery events via an injected `IPeerNotifier`.

## Usage

Minimal end-to-end wiring (Electron main process):

```ts
import { shell } from 'electron';
import { createMeshNode } from '@vibecook/truffle';
import { createPTYSessionManager } from '@avocado/core';
import {
  PTYMeshBridge,
  PTYSyncStore,
  RemoteSessionService,
  type IPeerNotifier,
} from '@avocado/transport-truffle';

// 1. Create the truffle node (handles Tailscale auth, sidecar, peer discovery).
const node = await createMeshNode({
  name: 'my-device',
  openUrl: (url) => { void shell.openExternal(url); },
  onAuthRequired: (url) => { /* surface to UI */ },
});

// 2. Create the avocado session manager (you supply the ProxySessionFactory
//    elsewhere to turn remote announcements into IPTYSession instances).
const sessionManager = createPTYSessionManager();
// sessionManager.setProxySessionFactory(myProxyFactory);

// 3. Wire the mesh bridge, sync store, and orchestration service.
const bridge = new PTYMeshBridge({ node, sessionManager });
const syncStore = new PTYSyncStore({ node });

const notifier: IPeerNotifier = {
  sessionFocusChanged: (sessionId, focused, source, deviceId) => {
    // Forward to renderer, e.g. win.webContents.send(...)
  },
  remoteSessionsChanged: (deviceId, count) => {
    // Update the device list in the UI
  },
};

const service = new RemoteSessionService({
  node,
  sessionManager,
  bridge,
  syncStore,
  notifier, // optional; omit for headless
});

// 4. Start the mesh flow.
await bridge.initialize();
await service.enable();

// Cleanup on app shutdown:
// await service.dispose();
// bridge.dispose();
// await syncStore.dispose();
// await node.stop();
```

## Wire format

Every PTY message on the mesh looks like:

```ts
{
  type: 'pty:input' | 'pty:output' | 'pty:resize' | ...,
  sessionId: string,
  // ...type-specific fields
}
```

The `type` values come from `WS_PTY_MESSAGE_TYPES` in `@avocado/types`. The entire object is JSON-serialized to a `Buffer` and sent via `node.send(peerId, 'pty', buf)`. On the receive side, truffle decodes the JSON at the NAPI boundary, so `msg.payload` is already a plain JS object — do **not** call `JSON.parse` on it.

Session discovery is **not** message-based; it goes through `PTYSyncStore` which publishes per-device slices of `{ sessions: RemoteSessionAnnounce[]; updatedAt: number }` via truffle's built-in `SyncedStore`.

## Reference source

Ported from `p008-claude-on-the-go/packages/desktop/src/main/services/foundation/pty/`:

- `remote-sessions/relay-session-manager.ts`
- `remote-sessions/remote-session-service.ts`
- `bridges/pty-mesh-bridge.ts`
- `transports/mesh-pty-transport.ts`
