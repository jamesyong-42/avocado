# `@vibecook/avocado-sdk/types`

Shared types, interfaces, and protocol constants. No runtime code — purely a type surface.

Key exports:

- `IPTYSession` — the session interface every session (local, IPC, remote proxy) implements
- `IPTYTransport` — the symmetric viewer/owner contract transports implement
- `BasePTYSession` — abstract base with shared lifecycle + event-emitter logic
- `WS_PTY_MESSAGE_TYPES` — wire-format discriminators shared across transports
- `TerminalInfo`, `TerminalMode`, `TerminalType` — virtual terminal types
- `RemoteSessionAnnounce` — sync-store shape published by each device
