/**
 * #transport-ipc — Barrel export
 *
 * IPC transport for avocado terminal sessions.
 * Provides Unix Domain Socket (macOS/Linux) and Named Pipe (Windows) transports,
 * used to bridge a CLI process to a desktop app running on the same machine.
 */

// Transport
export {
  IPCPTYTransport,
  createIPCPTYTransport,
} from './ipc-transport.js';
export type {
  IMessageBus,
  IPCPTYTransportMetadata,
  IPCPTYTransportOptions,
  SpawnRequestPayload,
  SpawnResponsePayload,
} from './ipc-transport.js';

// Bridge
export {
  PTYIPCBridgeImpl,
  createPTYIPCBridge,
} from './ipc-bridge.js';
export type {
  ConnectionReadyEvent,
  BusMessage,
  IIPCServer,
  PTYIPCBridgeEvents,
  PTYIPCBridgeOptions,
  IPTYIPCBridge,
} from './ipc-bridge.js';

// Session host (owner side)
export {
  IPCSessionHost,
  createIPCSessionHost,
} from './session-host.js';
export type {
  IPCSessionHostOptions,
  IPCSessionHostEvents,
  SpawnConfig,
  SpawnHandler,
} from './session-host.js';

// UDS client (owner-side socket plumbing)
export {
  UDSClient,
  createUDSClient,
} from './uds-client.js';
export type {
  UDSClientOptions,
  UDSClientEvents,
} from './uds-client.js';

// UDS Server
export {
  UDSServer,
  createUDSServer,
} from './uds-server.js';
export type {
  UDSServerConfig,
  NamespaceHandler,
} from './uds-server.js';
