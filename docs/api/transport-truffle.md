# `@vibecook/avocado-sdk/transport-truffle`

Tailscale-backed mesh transport. **Peer dep: `@vibecook/truffle`.**

See the [mesh transport guide](/guide/transport-truffle) for architecture and wiring.

## Key exports

- `MeshPTYTransport` — one per peer; implements `IPTYTransport`
- `PTYMeshBridge` — lifecycle for transports tied to peer connect/disconnect
- `PTYSyncStore` — session discovery via truffle's `SyncedStore`
- `RelaySessionManager` — owner-side forwarders
- `RemoteSessionService` — orchestrator
- `IPeerNotifier` — UI-notification side channel (optional)
- `PTY_NAMESPACE` — the shared truffle namespace for all PTY traffic
