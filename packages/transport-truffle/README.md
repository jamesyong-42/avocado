# @avocado/transport-truffle

Mesh transport for [avocado](../../README.md) — cross-device terminal session sync over Tailscale, via truffle.

## Status

Stub. Code will be ported from vibe-ctl's `packages/desktop/src/main/services/foundation/pty/` tree:

- `transports/mesh-pty-transport.ts`
- `bridges/pty-mesh-bridge.ts`
- `remote-sessions/remote-session-service.ts`

## Peer dependency

Requires `@vibecook/truffle` to be provided by the consumer. Avocado does not bundle the truffle runtime (which includes a native Rust NAPI binary).
