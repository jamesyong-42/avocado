/**
 * @avocado/transport-truffle — Barrel export
 *
 * Truffle mesh transport for avocado terminal sessions.
 *
 * This package ports vibe-ctl's PTY mesh-sync stack to avocado, rewritten
 * against `@vibecook/truffle`'s `NapiNode` API directly (no custom
 * `IMessageBus` abstraction). All five core files are complete:
 *
 *   ✓ MeshPTYTransport      — IPTYTransport over a single truffle peer
 *   ✓ RelaySessionManager   — owner-side forwarders (local → viewer)
 *   ✓ PTYSyncStore          — session discovery via truffle's SyncedStore
 *   ✓ PTYMeshBridge         — wires peer lifecycle → transports → session manager
 *   ✓ RemoteSessionService  — orchestrator that composes the above and
 *                              dispatches owner-side PTY commands
 *
 * Wiring cheat-sheet:
 *
 *   const node          = await createMeshNode({ appId: 'avocado-playground', deviceName: 'my-device', ... });
 *   const sessionManager = createPTYSessionManager();
 *   const bridge        = new PTYMeshBridge({ node, sessionManager });
 *   const syncStore     = new PTYSyncStore({ node });
 *   const service       = new RemoteSessionService({
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
