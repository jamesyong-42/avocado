# Sessions & Transports

The core abstraction is `IPTYSession`: a running PTY with id, dimensions, a stream of output bytes, and lifecycle events (`output`, `resized`, `exit`, `focusChanged`).

`PTYSessionManager` owns a set of `IPTYSession`s and a set of registered `IPTYTransport`s. Each session has a `source` — `'local'` (spawned in-process), `'ipc'` (reached over a UDS/pipe), or `'ws'` (a proxy for a remote peer's session).

`IPTYTransport` is the symmetrical viewer/owner contract every transport implements:

- **Viewer side** (this device) — `sendInput`, `sendResize`, `sendKill`, `sendFocus`, `subscribe`
- **Owner side** (this device) — `sendOutput`, `sendResized`, `sendSessionEnded`, `sendFocusChanged`

The session manager doesn't care which transport backs a given session — it routes through the registered transport for that session's source. That's why local, CLI-over-IPC, and remote peer sessions all feel identical to the UI layer.

## Terminal Service

Above the session model sits `TerminalService`, which tracks **virtual terminals** (UI surfaces that attach to a session) and enforces one-active-terminal-per-session. You can have multiple read-only "passive" terminals showing the same session, but only one that accepts input.

This is how the playground app handles two windows viewing the same shell, or the "active tab" model inside a single window.

## Transports available today

| Transport                       | Use case                                                                 |
|---------------------------------|--------------------------------------------------------------------------|
| `node-pty` + `LocalPTYSession`  | Spawn PTYs in the same process (Electron main, Node server)              |
| `transport-ipc`                 | CLI (`avo`) connects to the host via Unix Domain Socket or Named Pipe    |
| `transport-truffle`             | Cross-device mesh sync over Tailscale via `@vibecook/truffle`            |
| `transport-websocket` *(planned)* | Browser clients to a server                                            |
