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
  IPTYIPCBridge,
} from './ipc-bridge.js';

// UDS Server
export {
  UDSServer,
  createUDSServer,
} from './uds-server.js';
export type {
  UDSServerConfig,
  NamespaceHandler,
} from './uds-server.js';
