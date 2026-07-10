/**
 * #transport-truffle — Barrel export
 *
 * Truffle mesh transport for avocado terminal sessions.
 *
 * Peer-first against `@vibecook/truffle` ≥ 0.6 (RFC 022): hold `Peer`
 * handles for live routing; use durable ULID only for SyncedStore discovery.
 *
 *   ✓ MeshPTYTransport      — IPTYTransport bound to a Peer handle
 *   ✓ RelaySessionManager   — owner-side forwarders (local → viewer)
 *   ✓ PTYSyncStore          — session discovery via truffle's SyncedStore
 *   ✓ PTYMeshBridge         — peer lifecycle → transports (keyed by peer.ref)
 *   ✓ RemoteSessionService  — orchestrator + owner-side PTY dispatch
 *
 * Wiring cheat-sheet:
 *
 *   const node           = await createMeshNode({ appId: 'avocado-playground', deviceName: 'my-device', ... });
 *   const sessionManager = createPTYSessionManager();
 *   const bridge         = new PTYMeshBridge({ node, sessionManager });
 *   const syncStore      = new PTYSyncStore({ node });
 *   const service        = new RemoteSessionService({
 *     node, sessionManager, bridge, syncStore, notifier: myNotifier,
 *   });
 *   await bridge.initialize();
 *   await service.enable();
 */

export {
  MeshPTYTransport,
  createMeshPTYTransport,
  PTY_NAMESPACE,
} from './mesh-pty-transport.js';
export type { MeshPTYTransportOptions } from './mesh-pty-transport.js';

export {
  RelaySessionManager,
  RelayPTYSession,
  createRelaySessionManager,
} from './relay-session-manager.js';
export type {
  IRelaySessionManager,
  RelaySessionManagerEvents,
} from './relay-session-manager.js';

export {
  PTYSyncStore,
  createPTYSyncStore,
  DEFAULT_PTY_STORE_ID,
} from './pty-sync-store.js';
export type {
  PTYSessionsSlice,
  PTYSyncStoreOptions,
  RemoteSessionsChangeCallback,
} from './pty-sync-store.js';

export { PTYMeshBridge, createPTYMeshBridge } from './pty-mesh-bridge.js';
export type {
  IPTYMeshBridge,
  PTYMeshBridgeOptions,
  PTYMeshBridgeEvents,
} from './pty-mesh-bridge.js';

export {
  RemoteSessionService,
  createRemoteSessionService,
} from './remote-session-service.js';
export type {
  IPeerNotifier,
  RemoteSessionServiceOptions,
  RemoteSessionServiceEvents,
} from './remote-session-service.js';
