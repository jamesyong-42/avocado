/**
 * @avocado/transport-ipc — Barrel export
 *
 * IPC transport for avocado terminal sessions.
 * Provides Unix Domain Socket (macOS/Linux) and Named Pipe (Windows) transports,
 * used to bridge a CLI process to a desktop app running on the same machine.
 *
 * TODO: port IPCPTYTransport and PTYIPCBridge from @avocado/core.
 * Source files to move:
 *   - packages/core/src/transports/ipc-transport.ts  -> packages/transport-ipc/src/ipc-transport.ts
 *   - packages/core/src/bridges/ipc-bridge.ts        -> packages/transport-ipc/src/ipc-bridge.ts
 */

export {};
