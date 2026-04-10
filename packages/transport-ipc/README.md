# @avocado/transport-ipc

IPC transport for [avocado](../../README.md) — Unix Domain Socket (macOS/Linux) and Named Pipe (Windows).

Used to bridge a CLI process to a desktop app running on the same machine.

## Status

Stub. Code will be extracted from `@avocado/core`:

- `packages/core/src/transports/ipc-transport.ts` → `packages/transport-ipc/src/ipc-transport.ts`
- `packages/core/src/bridges/ipc-bridge.ts` → `packages/transport-ipc/src/ipc-bridge.ts`
