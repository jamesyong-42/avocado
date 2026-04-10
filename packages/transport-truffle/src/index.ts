/**
 * @avocado/transport-truffle — Barrel export
 *
 * Truffle mesh transport for avocado terminal sessions.
 * Syncs terminal sessions across devices over a Tailscale mesh via truffle.
 *
 * Status:
 *   ✓ MeshPTYTransport — ported from vibe-ctl
 *   ⧗ PTYMeshBridge         — not yet ported (needs truffle MeshService abstraction)
 *   ⧗ RemoteSessionService  — not yet ported (needs relay + session-store-sync)
 *
 * Until the bridge + service land, consumers must:
 *   1. Instantiate `@vibecook/truffle`'s MeshNode in their app
 *   2. Provide an IMessageBus implementation backed by truffle's NapiMessageBus
 *   3. Create MeshPTYTransport instances per connected device and register them
 *      with `PTYSessionManager` from `@avocado/core`
 *   4. Handle session announcements, relay sessions, and focus authority directly
 *      in application code
 *
 * See docs/IMPLEMENTATION-PLAN.md § "avocado + truffle Integration" for the plan.
 */

export {
  MeshPTYTransport,
  createMeshPTYTransport,
} from './mesh-pty-transport.js';
export type {
  IMessageBus,
  MeshPTYTransportOptions,
} from './mesh-pty-transport.js';
