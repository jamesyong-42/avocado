# @avocado/transport-truffle

Mesh transport for [avocado](../../README.md) — cross-device terminal session sync over Tailscale, via truffle.

## Status

**Partial port from vibe-ctl.**

| Layer | File | Status |
|-------|------|--------|
| Transport | `src/mesh-pty-transport.ts` | ✓ Ported |
| Bridge | `src/pty-mesh-bridge.ts` | ⧗ Pending |
| Service | `src/remote-session-service.ts` | ⧗ Pending |

### What's blocking the bridge + service

- **Electron coupling**: `RemoteSessionService` uses `BrowserWindow` to notify the renderer of focus changes. Needs an abstract notifier.
- **API drift**: `RemoteSessionService` calls `sessionManager.spawn()` and `getRemoteSessionId()` — neither exists on `@avocado/core`'s `PTYSessionManager`. Needs API additions or adapter layer.
- **Sub-services**: `RelaySessionManager` and `SessionStoreSync` are referenced but not yet ported.
- **Truffle coupling**: vibe-ctl's `MeshService`/`WSService` is a thick abstraction over `@vibecook/truffle`. Avocado needs a thinner adapter or direct truffle integration.

## Peer dependency

Requires `@vibecook/truffle` to be provided by the consumer. Avocado does not bundle the truffle runtime (which includes a native Rust NAPI binary).

## Consumer responsibilities (until bridge/service land)

1. Instantiate `@vibecook/truffle`'s `MeshNode` in your app
2. Implement `IMessageBus` (from this package) backed by truffle's `NapiMessageBus`
3. Create `MeshPTYTransport` instances per connected device
4. Register transports with `PTYSessionManager` from `@avocado/core`
5. Handle session announcements, relay sessions, and focus authority directly in app code

Source files in vibe-ctl: `packages/desktop/src/main/services/foundation/pty/`
