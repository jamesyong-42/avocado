# `@vibecook/avocado-sdk/transport-truffle`

Tailscale-backed mesh transport. **Peer dep: `@vibecook/truffle@^0.6.0`** (RFC 022 Peer-first API).

See the [mesh transport guide](/guide/transport-truffle) for architecture and wiring.

## Key exports

- `MeshPTYTransport` — one per peer; holds a `Peer` handle; implements `IPTYTransport`
- `PTYMeshBridge` — lifecycle for transports tied to peer connect/disconnect (`peer.ref` primary key; `getTransportByDeviceId` for store reconciliation)
- `PTYSyncStore` — session discovery via truffle's `SyncedStore` (ULID-keyed slices)
- `RelaySessionManager` — owner-side forwarders
- `RemoteSessionService` — orchestrator
- `IPeerNotifier` — UI-notification side channel (optional)
- `PTY_NAMESPACE` — the shared truffle namespace for all PTY traffic
