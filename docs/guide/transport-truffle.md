# Mesh Transport (Truffle)

`@vibecook/avocado-sdk/transport-truffle` provides cross-device terminal session sync over Tailscale via [`@vibecook/truffle`](https://www.npmjs.com/package/@vibecook/truffle).

## Architecture

```
            ┌─────────────────────────┐
            │  RemoteSessionService   │  owner-side dispatch,
            │  (orchestrator)         │  relay bookkeeping,
            └──────────┬──────────────┘  sync-store reconciliation
                       │
     ┌─────────────────┼─────────────────┐
     │                 │                 │
┌────▼────────┐ ┌──────▼──────┐ ┌────────▼────────┐
│PTYMeshBridge│ │PTYSyncStore │ │ RelaySessionMgr │
└─────┬───────┘ └─────┬───────┘ └─────────────────┘
      │               │
      │ onPeerChange  │ syncedStore('avocado-pty-sessions')
      │               │
┌─────▼───────────────────────────────────┐
│             @vibecook/truffle           │
│          (NapiNode + SyncedStore)       │
└─────────────────────────────────────────┘
```

- **MeshPTYTransport** — one per peer, implements `IPTYTransport`
- **PTYMeshBridge** — owns transport lifecycle (create on `ws_connected`, tear down on `ws_disconnected`)
- **PTYSyncStore** — session discovery via truffle's `SyncedStore` primitive
- **RelaySessionManager** — per-(session, viewer) forwarders that copy `output` / `resized` / `exit` from a local session to a viewer's transport
- **RemoteSessionService** — orchestrator that ties the above together and dispatches owner-side PTY commands

## Minimal wiring

```ts
import { createMeshNode } from '@vibecook/truffle';
import { createPTYSessionManager } from '@vibecook/avocado-sdk';
import {
  PTYMeshBridge,
  PTYSyncStore,
  RemoteSessionService,
  type IPeerNotifier,
} from '@vibecook/avocado-sdk/transport-truffle';

const node = await createMeshNode({
  appId: 'my-app',
  deviceName: 'my-device',
  onAuthRequired: (url) => { /* surface to UI */ },
});

const sessionManager = createPTYSessionManager();
const bridge   = new PTYMeshBridge({ node, sessionManager });
const syncStore = new PTYSyncStore({ node });

const notifier: IPeerNotifier = {
  sessionFocusChanged: () => {},
  remoteSessionsChanged: () => {},
};

const service = new RemoteSessionService({
  node, sessionManager, bridge, syncStore, notifier,
});

await bridge.initialize();
await service.enable();
```

## Wire format

Every PTY message on the mesh shares this shape:

```ts
{
  type: 'pty:input' | 'pty:output' | 'pty:resize' | ...,
  sessionId: string,
  // type-specific fields
}
```

`type` values come from `WS_PTY_MESSAGE_TYPES` in `@vibecook/avocado-sdk/types`. The object is JSON-serialized to a `Buffer` and sent via `node.send(peerId, 'pty', buf)`. On the receive side, truffle decodes the JSON at the NAPI boundary — `msg.payload` is already a plain JS object.

Session discovery is **not** message-based; it goes through `PTYSyncStore`, which publishes per-device slices of `{ sessions: RemoteSessionAnnounce[]; updatedAt: number }` via truffle's `SyncedStore`.

## Out of scope for v0.1

- Remote session spawning (`CREATE_SESSION` returns `CREATE_FAILED`)
- Primary device election / focus conflict resolution (cooperative last-write-wins)
