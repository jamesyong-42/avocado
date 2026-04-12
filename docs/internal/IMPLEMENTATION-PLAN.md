> **Repositioning note (2026-04-10)**
>
> Avocado is now framed as a **terminal session sync library** across four transports:
> - `node-pty` (local in-process)
> - **IPC** — UDS / Named Pipe (`@avocado/transport-ipc`)
> - **Mesh** — via truffle (`@avocado/transport-truffle`)
> - **WebSocket** — planned (`@avocado/transport-ws`, deferred)
>
> Transports are being extracted out of `@avocado/core` into dedicated packages. The repo now also includes `apps/playground` — an Electron showcase for mesh sync via truffle. See the root `README.md` for the current structure. Sections below reflect the original extraction plan and will be updated as the refactor lands.

# Avocado Implementation Plan
**Status**: Ready for implementation
**Created**: 2026-03-16

I now have a thorough understanding of the entire codebase. Let me produce the implementation plan.

---

# Avocado Extraction Plan: Implementation Specification

## Table of Contents
1. Package Structure
2. Architecture: avocado + truffle Integration
3. File Migration Map
4. Electron Decoupling
5. Build Configuration
6. Testing Strategy
7. Implementation Order
8. Risk Mitigation

---

## 1. Package Structure

### Monorepo Layout

```
/Users/jamesyong/Projects/project100/p008/avocado/
  package.json              # Root workspace config
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.config.ts
  packages/
    types/                  # @avocado/types
    core/                   # @avocado/core
    react/                  # @avocado/react
    node-pty/               # @avocado/node-pty
    truffle/                # @avocado/truffle
```

### Sub-package Responsibilities

**`@avocado/types`** (pure TypeScript, zero dependencies)
- All shared interfaces, type definitions, event maps, constants
- `IPTYSession`, `IPTYTransport`, `IPTYSessionOwner`, `ITerminal`, `IMessageBus`
- Session types (`SessionSource`, `TransportType`, `PTYSessionState`, metadata types)
- Protocol messages, wire format types, type guards
- Store sync types (`DeviceSlice`, `StoreChangeEvent`, `CrossDeviceStoreSnapshot`)
- Terminal types (`TerminalMode`, `TerminalType`, `TerminalInfo`, `TerminalEntry`)
- Utility classes: `CircularOutputBuffer`, session ID generators
- This package is the dependency root; every other avocado package depends on it

**`@avocado/core`** (Node.js, no native deps, no Electron deps)
- `BasePTYSession` abstract class
- `ProxyPTYSession` (delegates to transport)
- `PTYSessionManager` (manages all sessions uniformly)
- `TerminalService` (headless terminal management via `@xterm/headless`)
- `TerminalStoreSync` abstracted behind `ITerminalStoreSync` interface
- Session store sync (`ISessionStoreSync`)
- Bridge interfaces: `IPTYIPCBridge`, `IPTYMeshBridge` (interface only)
- `IPTYSessionSource` interface for `TerminalService` to consume
- Store infrastructure: `DeviceStore`, `LocalDeviceStore`, `LocalStoreRegistry`, store definitions
- The `BrowserWindow` import in `TerminalStoreSync` must be removed (see section 4)

**`@avocado/node-pty`** (Node.js, native dependency)
- `LocalPTYSession` (wraps `node-pty`)
- `IPty` interface (already defined in shared)
- `PTYSpawnFunction` factory type
- node-pty spawn adapter: thin wrapper that converts `node-pty.spawn()` to `IPty`
- This is an optional package; consumers who only view remote terminals skip it

**`@avocado/react`** (browser, React 19)
- Components: `VirtualTerminal`, `HeadlessTerminal`, `TerminalCard`, `TerminalGrid`
- Core hook: `useTerminalCore`
- Management hooks: `usePTYSessions`, `useTerminals`, `useTerminalGrid`, `useTerminalAPI`, `useIPCServer`
- Store hooks: `useCrossDeviceStore` (refactored from `CrossDeviceStoreClient`)
- WebGL renderers: `DefaultRenderer`, `WebGLRenderer`, `TerminalPlane`, `CRTEffect`, `useTextureSync`
- Renderer types and presets
- All `window.desktopAPI` calls replaced with `TerminalBackend` interface (see section 4)

**`@avocado/truffle`** (Node.js, depends on `@vibecook/truffle`)
- `TrufflePTYTransport` (implements `IPTYTransport` using truffle's `NapiMessageBus`)
- `TrufflePTYBridge` (implements `IPTYMeshBridge`, replaces `PTYMeshBridgeImpl`)
- `TruffleStoreSyncAdapter` (implements `StoreSyncAdapter`, replaces `StoreSyncAdapterImpl`)
- `TruffleRemoteSessionService` (replaces `RemoteSessionService`)
- Wiring function: `wireAvocadoToTruffle(meshNode, sessionManager)` -- single entry point

### Why `@avocado/truffle` is a Separate Package (Not in Core)

The truffle bridge must be separate because:
1. It depends on `@vibecook/truffle` (which pulls in `@vibecook/truffle-native`, a Rust NAPI addon). Consumers who want avocado with a different transport should not have this dependency.
2. It mirrors truffle's own `@vibecook/truffle-react` pattern where integration layers are separate.
3. It keeps `@avocado/core` testable without needing a compiled Rust binary.

### Dependency Graph

```
@avocado/types        (zero deps)
    |
    +-- @avocado/core      (depends on: @avocado/types, @xterm/headless, @msgpack/msgpack)
    |       |
    |       +-- @avocado/node-pty   (depends on: @avocado/core, node-pty)
    |       |
    |       +-- @avocado/truffle    (depends on: @avocado/core, @vibecook/truffle)
    |
    +-- @avocado/react     (depends on: @avocado/types, xterm, @xterm/addon-fit,
                            @xterm/addon-webgl, three, @react-three/fiber,
                            @react-three/postprocessing, react)
```

Note: `@avocado/react` depends on `@avocado/types` (NOT `@avocado/core`). The React package only needs the type definitions -- it communicates with the backend through the `TerminalBackend` interface, not by importing Node.js code.

---

## 2. Architecture: avocado + truffle Integration

### 2.1 The `IPTYTransport` Interface (Already Exists, Moves to `@avocado/types`)

The existing `IPTYTransport` at `/Users/jamesyong/Projects/project100/p008/p008-claude-on-the-go/packages/shared/src/pty/interfaces/pty-transport.ts` is already well-designed. It moves unchanged to `@avocado/types`.

Key interface surface (summarized):
```typescript
interface IPTYTransport extends EventEmitter {
  readonly transportId: string;
  readonly transportType: TransportType;
  readonly isReady: boolean;
  
  // Connection
  disconnect(reason?: string): void;
  dispose(): void;
  
  // Viewer -> Owner
  sendInput(sessionId: string, data: string | Buffer): void;
  sendResize(sessionId: string, cols: number, rows: number): void;
  sendKill(sessionId: string, signal?: string): void;
  sendFocus(sessionId: string, focused: boolean): void;
  
  // Owner -> Viewer (relay mode)
  sendOutput(sessionId: string, data: Buffer, targetDeviceId: string): void;
  sendResized(sessionId: string, cols: number, rows: number, targetDeviceId: string): void;
  sendSessionEnded(sessionId: string, exitCode: number, targetDeviceId: string): void;
  sendFocusChanged(sessionId: string, focused: boolean, targetDeviceId: string): void;
  
  // Events: sessionAnnounced, sessionEnded, output, resized, focusChanged,
  //         inputReceived, resizeRequested, killRequested, focusReceived,
  //         connected, disconnected, handshakeCompleted, error
}
```

**Change needed:** Add `TransportType = 'ipc' | 'ws' | 'truffle'` to accommodate the new transport. Alternatively, keep it as `string` and let truffle use `'truffle'`. The preferred approach is to make `TransportType` a string union that is open-ended:
```typescript
export type TransportType = 'ipc' | 'ws' | string;
```

### 2.2 The `ITerminalStoreSync` Interface (Already Exists, Moves to `@avocado/core`)

The existing interface at `terminal-store-sync.ts` lines 47-100+ is already well-designed. The implementation currently imports `BrowserWindow` from Electron for IPC notification. This must be replaced with a generic notification callback (see section 4).

### 2.3 How `PTYMeshBridge` Becomes `PTYTruffleBridge`

**Current flow (mesh):**
```
PTYMeshBridgeImpl
  -> listens to: MeshService (device connect/disconnect), WSService (WebSocket events)
  -> creates: MeshPTYTransport (wraps IMessageBus)
  -> registers transports with: PTYSessionManager
  -> routes messages from: MeshMessageBus (subscribe to 'pty' namespace)
```

**New flow (truffle):**
```
TrufflePTYBridge (in @avocado/truffle)
  -> listens to: NapiMeshNode.onEvent() for device discovery/offline events
  -> creates: TrufflePTYTransport (wraps NapiMeshNode messaging)
  -> registers transports with: PTYSessionManager (from @avocado/core)
  -> routes messages using: NapiMeshNode.onMessage() filtered by 'pty' namespace
```

**`TrufflePTYTransport` implementation:**

```typescript
// @avocado/truffle/src/truffle-pty-transport.ts
class TrufflePTYTransport extends EventEmitter implements IPTYTransport {
  private node: NapiMeshNode;
  private deviceId: string;
  
  get transportId(): string { return `truffle:${this.deviceId}`; }
  get transportType(): string { return 'truffle'; }
  get isReady(): boolean { return this._connected; }
  
  sendInput(sessionId: string, data: string | Buffer): void {
    this.node.sendEnvelope(this.deviceId, 'pty', 'input', {
      sessionId,
      data: Buffer.isBuffer(data) ? data.toString('base64') : data,
    });
  }
  
  sendResize(sessionId: string, cols: number, rows: number): void {
    this.node.sendEnvelope(this.deviceId, 'pty', 'resize', { sessionId, cols, rows });
  }
  
  // ... same pattern for all other methods
  // Output received via node.onMessage() dispatched by TrufflePTYBridge
}
```

The key insight: `NapiMeshNode` already has `sendEnvelope(deviceId, namespace, type, payload)` and `broadcastEnvelope(namespace, type, payload)` which map directly to the `IMessageBus.publish()` and `IMessageBus.broadcast()` patterns. The bridge subscribes via `node.onMessage()` and dispatches to the correct transport.

### 2.4 Complete Data Flow

```
LOCAL PTY -> avocado -> truffle -> remote device -> avocado -> renderer

Detailed:

[Device A - Owner]
  node-pty process
    -> LocalPTYSession.on('output', data)
      -> PTYSessionManager.emit('output', {sessionId, data})
        -> TerminalService feeds @xterm/headless (if headless terminal attached)
        -> TrufflePTYBridge relay session
          -> TrufflePTYTransport.sendOutput(sessionId, data, targetDeviceId)
            -> NapiMeshNode.sendEnvelope(targetDeviceId, 'pty', 'output', {...})
              -> Rust truffle-core routes over Tailscale WebSocket
                -> [Network]

[Device B - Viewer]
  NapiMeshNode.onMessage(callback)
    -> TrufflePTYBridge.handleIncomingMessage(busMessage)
      -> TrufflePTYTransport.emit('output', sessionId, data)
        -> ProxyPTYSession.handleOutput(sessionId, data)
          -> ProxyPTYSession.pushOutput(data)  [buffers in CircularOutputBuffer]
          -> ProxyPTYSession.emit('output', data)
            -> PTYSessionManager.emit('output', {sessionId, data})
              -> TerminalBackend IPC/invoke to renderer
                -> useTerminalCore receives base64 data
                  -> xterm.js Terminal.write(data)
                    -> VirtualTerminal renders to DOM/WebGL
```

### 2.5 Store Sync via Truffle

The cross-device store (terminals, pty-sessions) currently uses:
- `DeviceStoreImpl` that subscribes to `IMessageBus` for sync messages
- `StoreSyncAdapterImpl` that bridges stores to mesh

With truffle, this becomes:
- `DeviceStoreImpl` stays in `@avocado/core`, still uses `IMessageBus`
- `TruffleMessageBusAdapter` (in `@avocado/truffle`) implements `IMessageBus` by wrapping `NapiMeshNode`
- OR: use `NapiStoreSyncAdapter` directly if truffle's Rust-side CRDT sync is sufficient

**Recommended approach:** Create a `TruffleMessageBus` that implements `IMessageBus` using `NapiMeshNode`. This lets the existing `DeviceStoreImpl` work unchanged. The `NapiStoreSyncAdapter` can be used as an optimization later but is not required for v1.

```typescript
// @avocado/truffle/src/truffle-message-bus.ts
class TruffleMessageBus extends EventEmitter implements IMessageBus {
  constructor(private node: NapiMeshNode) { ... }
  
  subscribe(namespace: string, handler: BusMessageHandler): () => void {
    // Filter node.onMessage() by namespace
  }
  
  publish(targetId: string, namespace: string, type: string, payload: unknown): boolean {
    this.node.sendEnvelope(targetId, namespace, type, payload);
    return true;
  }
  
  broadcast(namespace: string, type: string, payload: unknown): void {
    this.node.broadcastEnvelope(namespace, type, payload);
  }
}
```

---

## 3. File Migration Map

Paths are relative to the source monorepo root: `/Users/jamesyong/Projects/project100/p008/p008-claude-on-the-go/`

### 3.1 Files Moving to `@avocado/types`

| Source Path | Destination Path | Changes |
|---|---|---|
| `packages/shared/src/pty/interfaces/pty-transport.ts` | `packages/types/src/interfaces/pty-transport.ts` | Make `TransportType` extensible: `'ipc' \| 'ws' \| string` |
| `packages/shared/src/pty/interfaces/pty-session.ts` | `packages/types/src/interfaces/pty-session.ts` | None |
| `packages/shared/src/pty/interfaces/pty-session-owner.ts` | `packages/types/src/interfaces/pty-session-owner.ts` | None |
| `packages/shared/src/pty/interfaces/terminal.ts` | `packages/types/src/interfaces/terminal.ts` | None |
| `packages/shared/src/pty/interfaces/index.ts` | `packages/types/src/interfaces/index.ts` | None |
| `packages/shared/src/pty/types.ts` | `packages/types/src/session-types.ts` | None |
| `packages/shared/src/pty/protocol/constants.ts` | `packages/types/src/protocol/constants.ts` | Remove re-exports from `frame-codec.js`, inline the values |
| `packages/shared/src/pty/protocol/messages.ts` | `packages/types/src/protocol/messages.ts` | Keep message types, constructors, type guards. Move wire encoding (`encodeMessage`, `decodeFrame`, `parseFrames`) to `@avocado/core` (they use `@msgpack/msgpack`) |
| `packages/shared/src/pty/protocol/ws-messages.ts` | `packages/types/src/protocol/ws-messages.ts` | None |
| `packages/shared/src/pty/utils/output-buffer.ts` | `packages/types/src/utils/output-buffer.ts` | None (pure TS, no deps) |
| `packages/shared/src/pty/utils/session-id.ts` | `packages/types/src/utils/session-id.ts` | Uses `crypto.randomUUID` and `os.homedir` -- these are Node.js APIs. Move to `@avocado/core` instead. For `@avocado/types`, extract only the pure functions (`createNamespacedId`, `parseNamespacedId`, `isNamespacedId`, `getOriginalId`, `getConnectionId`, `isValidSource`, `isCliSessionId`, `isLocalSessionId`). The generators (`generateCliSessionId`, `generateLocalSessionId`, `getSocketDir`, `getSocketPath`) go to `@avocado/core`. |
| `packages/shared/src/protocol/messaging.ts` | `packages/types/src/messaging.ts` | None |
| `packages/shared/src/types/store-sync.ts` | `packages/types/src/store-sync.ts` | Remove `zod` dependency: convert Zod schemas to plain validation functions. The runtime schemas (`DeviceSliceSchema`, etc.) are only used by `store-definitions.ts` validators. |
| `packages/shared/src/protocol/frame-codec.ts` | `packages/types/src/protocol/frame-codec.ts` | Extract constants only; encoding/decoding logic goes to `@avocado/core` |

### 3.2 Files Moving to `@avocado/core`

| Source Path | Destination Path | Changes |
|---|---|---|
| `packages/shared/src/pty/sessions/base-pty-session.ts` | `packages/core/src/sessions/base-pty-session.ts` | Update imports to `@avocado/types` |
| `packages/shared/src/pty/sessions/proxy-pty-session.ts` | `packages/core/src/sessions/proxy-pty-session.ts` | Update imports to `@avocado/types` |
| `packages/desktop/src/main/services/foundation/pty/pty-session-manager.ts` | `packages/core/src/pty-session-manager.ts` | **Major refactor**: (1) Remove `import * as pty from 'node-pty'` -- accept spawn function via constructor injection. (2) Remove singleton `getPTYSessionManager()`. (3) Accept `IPTYSpawner` interface instead of direct `pty.spawn`. (4) Update imports to `@avocado/types`. |
| `packages/desktop/src/main/services/foundation/terminal-service.ts` | `packages/core/src/terminal-service.ts` | **Major refactor**: (1) Remove Electron-specific `BrowserWindow` import. (2) Accept `ITerminalStoreSync` via constructor. (3) Remove singleton. (4) Keep `@xterm/headless` dependency. |
| `packages/desktop/src/main/services/foundation/terminal-store-sync.ts` | `packages/core/src/terminal-store-sync.ts` | **Major refactor**: (1) Remove `import { BrowserWindow } from 'electron'`. (2) Replace `BrowserWindow.getAllWindows().forEach(w => w.webContents.send(...))` with a `NotificationSink` callback. (3) Remove singleton `getTerminalStoreSync()`. (4) Remove import of `getLocalStoreRegistry()` singleton -- accept `LocalStoreRegistry` via constructor. |
| `packages/desktop/src/main/services/foundation/pty/bridges/pty-ipc-bridge.ts` | `packages/core/src/bridges/pty-ipc-bridge.ts` | **Major refactor**: (1) Remove singleton `getPTYIPCBridge()`. (2) Accept `PTYSessionManager` via constructor (already partially done). (3) Update imports. |
| `packages/desktop/src/main/services/foundation/pty/transports/ipc-pty-transport.ts` | `packages/core/src/transports/ipc-pty-transport.ts` | Update imports to `@avocado/types`. Remove import of `ITerminalStoreSync` (moved to bridge). |
| `packages/desktop/src/main/services/foundation/pty/remote-sessions/relay-session-manager.ts` | `packages/core/src/remote-sessions/relay-session-manager.ts` | Update imports. |
| `packages/desktop/src/main/services/foundation/pty/remote-sessions/session-store-sync.ts` | `packages/core/src/remote-sessions/session-store-sync.ts` | Remove singleton `getPTYSessionManager()` call. Accept via constructor. |
| `packages/desktop/src/main/services/foundation/pty/remote-sessions/remote-session-service.ts` | `packages/core/src/remote-sessions/remote-session-service.ts` | **Major refactor**: (1) Remove `import { BrowserWindow } from 'electron'`. (2) Remove all singleton getters. (3) Accept all dependencies via constructor: `PTYSessionManager`, `TerminalService`, `ITerminalStoreSync`, `IPTYIPCBridge`. (4) Remove mesh-specific code (replaced by `@avocado/truffle`). (5) Extract transport-agnostic logic into `BaseRemoteSessionService`. |
| `packages/desktop/src/main/services/foundation/store/device-store.ts` | `packages/core/src/store/device-store.ts` | Update imports to `@avocado/types`. |
| `packages/desktop/src/main/services/foundation/store/local-device-store.ts` | `packages/core/src/store/local-device-store.ts` | Update imports. |
| `packages/desktop/src/main/services/foundation/store/local-store-registry.ts` | `packages/core/src/store/local-store-registry.ts` | Remove singleton. Accept config via constructor. |
| `packages/desktop/src/main/services/foundation/store/store-definitions.ts` | `packages/core/src/store/store-definitions.ts` | Update imports. Remove `zod` schema imports -- use plain validators. Only keep `pty-sessions` and `terminals` stores (avocado-relevant). `todos` and `proxies` are vibe-ctl-specific. |
| `packages/desktop/src/main/services/foundation/store/store-initialization.ts` | `packages/core/src/store/store-initialization.ts` | Adapt for DI. |
| `packages/desktop/src/main/services/foundation/store/store-registry.ts` | `packages/core/src/store/store-registry.ts` | Update imports. |
| `packages/desktop/src/main/services/foundation/store/stores/pty-sessions-store.ts` | `packages/core/src/store/stores/pty-sessions-store.ts` | Update imports. |
| `packages/desktop/src/main/services/foundation/store/stores/terminals-store.ts` | `packages/core/src/store/stores/terminals-store.ts` | Update imports. |
| `packages/desktop/src/main/services/foundation/store/types.ts` | `packages/core/src/store/types.ts` | Update imports. |
| `packages/desktop/src/main/services/foundation/store/store-sync-adapter.ts` | `packages/core/src/store/store-sync-adapter.ts` | **Major refactor**: Extract interface `IStoreSyncAdapter` (already exists). Remove `MeshService` dependency. Accept `IMessageBus` and device event sources via constructor. The mesh-specific implementation moves to `@avocado/truffle`. |
| Wire encoding from `messages.ts` (`encodeMessage`, `decodeFrame`, `parseFrames`) | `packages/core/src/protocol/wire-codec.ts` | Keeps `@msgpack/msgpack` dependency |

### 3.3 Files Moving to `@avocado/node-pty`

| Source Path | Destination Path | Changes |
|---|---|---|
| `packages/shared/src/pty/sessions/local-pty-session.ts` | `packages/node-pty/src/local-pty-session.ts` | Update imports to `@avocado/types` and `@avocado/core`. |
| (new) | `packages/node-pty/src/spawn-adapter.ts` | Thin adapter: `createNodePtySpawner(): PTYSpawnFunction` that wraps `pty.spawn()` into the `IPty` interface. |

### 3.4 Files Moving to `@avocado/react`

| Source Path | Destination Path | Changes |
|---|---|---|
| `packages/desktop/src/renderer/components/terminal/VirtualTerminal.tsx` | `packages/react/src/components/VirtualTerminal.tsx` | Replace `window.desktopAPI` with `useTerminalBackend()` context hook. |
| `packages/desktop/src/renderer/components/terminal/HeadlessTerminal.tsx` | `packages/react/src/components/HeadlessTerminal.tsx` | Same `window.desktopAPI` replacement. |
| `packages/desktop/src/renderer/components/terminal/TerminalCard.tsx` | `packages/react/src/components/TerminalCard.tsx` | Same replacement. |
| `packages/desktop/src/renderer/components/terminal/TerminalGrid.tsx` | `packages/react/src/components/TerminalGrid.tsx` | Same replacement. |
| `packages/desktop/src/renderer/components/terminal/useTerminalCore.ts` | `packages/react/src/hooks/useTerminalCore.ts` | Replace `window.desktopAPI.pty.onOutput` etc. with `useTerminalBackend()`. |
| `packages/desktop/src/renderer/components/terminal/renderers/*` | `packages/react/src/renderers/*` | No changes (pure rendering). |
| `packages/desktop/src/renderer/hooks/terminal/usePTYSessions.ts` | `packages/react/src/hooks/usePTYSessions.ts` | Replace `window.desktopAPI` calls. |
| `packages/desktop/src/renderer/hooks/terminal/useTerminals.ts` | `packages/react/src/hooks/useTerminals.ts` | Replace `window.desktopAPI` and `useCrossDeviceStore` calls. |
| `packages/desktop/src/renderer/hooks/terminal/useTerminalGrid.ts` | `packages/react/src/hooks/useTerminalGrid.ts` | Likely no API calls -- verify. |
| `packages/desktop/src/renderer/hooks/terminal/useIPCServer.ts` | `packages/react/src/hooks/useIPCServer.ts` | Replace `window.desktopAPI.ipc` calls. |
| `packages/desktop/src/renderer/hooks/terminal/useTerminalAPI.ts` | `packages/react/src/hooks/useTerminalAPI.ts` | Replace `window.desktopAPI` calls. |
| `packages/desktop/src/renderer/stores/cross-device-store-client.ts` | `packages/react/src/store/cross-device-store-client.ts` | Replace `window.desktopAPI.crossDeviceStore` with `TerminalBackend`. |
| `packages/desktop/src/renderer/stores/use-cross-device-store.ts` | `packages/react/src/store/use-cross-device-store.ts` | Update import paths. |
| `packages/desktop/src/renderer/types/terminal.ts` | `packages/react/src/types.ts` | No changes (already standalone). |

### 3.5 Files Moving to `@avocado/truffle`

| Source Path | Destination Path | Changes |
|---|---|---|
| `packages/desktop/src/main/services/foundation/pty/transports/mesh-pty-transport.ts` | `packages/truffle/src/truffle-pty-transport.ts` | **Rewrite**: Replace `IMessageBus` with `NapiMeshNode.sendEnvelope()`. Rename class to `TrufflePTYTransport`. |
| `packages/desktop/src/main/services/foundation/pty/bridges/pty-mesh-bridge.ts` | `packages/truffle/src/truffle-pty-bridge.ts` | **Rewrite**: Replace `MeshService`/`WSService` listeners with `NapiMeshNode.onEvent()` and `NapiMeshNode.onMessage()`. |
| `packages/desktop/src/main/services/foundation/store/store-sync-adapter.ts` (implementation) | `packages/truffle/src/truffle-store-sync-adapter.ts` | **Rewrite**: Replace `MeshService` dependency with `NapiMeshNode`. Use `TruffleMessageBus` (also in this package) to feed existing `DeviceStoreImpl`. |
| (new) | `packages/truffle/src/truffle-message-bus.ts` | New file: `TruffleMessageBus implements IMessageBus`, wraps `NapiMeshNode`. |
| (new) | `packages/truffle/src/wire-avocado.ts` | Entry point: `wireAvocadoToTruffle(node, sessionManager, options)`. Creates bridge, message bus, store sync, returns teardown function. |

### 3.6 Files DELETED (Replaced by Truffle)

These files in the source project are NOT migrated -- their functionality is replaced by truffle and `@avocado/truffle`:

| Source Path | Replacement |
|---|---|
| `packages/desktop/src/main/services/foundation/mesh/mesh-service.ts` | `NapiMeshNode` from truffle |
| `packages/desktop/src/main/services/foundation/mesh/ws-service.ts` | Truffle handles WebSocket internally |
| `packages/desktop/src/main/services/foundation/mesh/tsnet-service.ts` | Truffle manages tsnet sidecar |
| `packages/desktop/src/main/services/foundation/mesh/device-manager.ts` | `NapiMeshNode.devices()` |
| `packages/desktop/src/main/services/foundation/mesh/primary-election.ts` | `NapiMeshNode.isPrimary()` |
| `packages/desktop/src/main/services/foundation/mesh/mesh-message-bus.ts` | `TruffleMessageBus` |
| `packages/desktop/src/main/services/foundation/mesh/mesh-config.ts` | Truffle config |
| `packages/desktop/src/main/services/foundation/mesh/types.ts` | Truffle types |
| `packages/desktop/src/main/services/foundation/mesh/index.ts` | N/A |
| All `packages/tsnet-sidecar/*` | Truffle manages its own sidecar binaries |

### 3.7 Files NOT Migrated (vibe-ctl specific)

These stay in the source project, are NOT part of avocado:

- Everything under `packages/desktop/src/main/services/domain/` (Claude Code parsing, analytics, etc.)
- Everything under `packages/desktop/src/renderer/components/chat/`, `charts/`, `widgets/`, `filters/`
- `packages/desktop/src/main/services/foundation/push/` (push notifications)
- `packages/desktop/src/main/services/cache/` (SQLite session cache)
- `packages/desktop/src/main/ipc/` (Electron IPC handlers -- vibe-ctl will import avocado and wire handlers)
- `packages/desktop/src/preload/index.ts` (Electron preload -- stays, but simplified)
- `packages/shared/src/agent/` (Claude Code agent data types)
- `packages/shared/src/types/` except `store-sync.ts` (session, message, api, mesh, websocket, history, p2p types are vibe-ctl specific)
- `packages/shared/src/platform/` (IPC path resolution -- can stay or be inlined)

---

## 4. Electron Decoupling

### 4.1 The `TerminalBackend` Interface

This interface replaces all `window.desktopAPI` calls in the React components. It is the contract between `@avocado/react` (browser) and whatever backend hosts avocado (Electron, Tauri, direct in-process).

```typescript
// @avocado/types/src/terminal-backend.ts

export interface TerminalBackend {
  // ─── PTY Session Management ───────────────────────────────────────
  pty: {
    create(options: { command?: string; args?: string[]; cwd?: string; cols?: number; rows?: number }): Promise<{ success: boolean; sessionId?: string; error?: string }>;
    destroy(sessionId: string): Promise<{ success: boolean; error?: string }>;
    list(): Promise<{ success: boolean; sessions?: PtySessionInfo[]; error?: string }>;
    listBySource(source: SessionSource): Promise<{ success: boolean; sessions?: PtySessionInfo[]; error?: string }>;
    listAll(): Promise<{ success: boolean; sessions?: PtySessionInfo[]; error?: string }>;
    write(sessionId: string, data: string): Promise<{ success: boolean; error?: string }>;
    resize(sessionId: string, cols: number, rows: number): Promise<{ success: boolean; error?: string }>;
    
    onOutput(callback: (terminalId: string, sessionId: string, base64Data: string) => void): () => void;
    onExit(callback: (sessionId: string, exitCode: number) => void): () => void;
    onSessionResized(callback: (sessionId: string, cols: number, rows: number, source: string, origin: string) => void): () => void;
    onSessionDiscovered(callback: (data: { sessionId: string; source: SessionSource }) => void): () => void;
    onSessionLost(callback: (data: { sessionId: string; source: SessionSource; reason: string }) => void): () => void;
    onSessionFocusChanged(callback: (data: { sessionId: string; focused: boolean }) => void): () => void;
  };

  // ─── Terminal Management ──────────────────────────────────────────
  terminal: {
    createHeadless(sessionId: string, options: { cols: number; rows: number; mode: TerminalMode }): Promise<{ success: boolean; terminalId?: string; error?: string }>;
    createVirtual(sessionId: string, options: { cols: number; rows: number; mode: TerminalMode }): Promise<{ success: boolean; terminalId?: string; error?: string }>;
    destroy(terminalId: string): Promise<{ success: boolean; error?: string }>;
    list(sessionId?: string): Promise<{ success: boolean; terminals?: TerminalInfo[]; error?: string }>;
    resize(terminalId: string, cols: number, rows: number): Promise<{ success: boolean; error?: string }>;
    setActive(terminalId: string): Promise<{ success: boolean; error?: string }>;
    getScreenContent(terminalId: string): Promise<{ success: boolean; content?: string; error?: string }>;
    getScreenLines(terminalId: string): Promise<{ success: boolean; lines?: string[]; error?: string }>;
    getSessionDimensions(sessionId: string): Promise<{ success: boolean; dimensions?: { cols: number; rows: number }; error?: string }>;
    getActiveTerminal(sessionId: string): Promise<{ success: boolean; terminalId?: string | null; error?: string }>;
    
    onDestroyed(callback: (terminalId: string, sessionId: string) => void): () => void;
  };

  // ─── IPC Server ───────────────────────────────────────────────────
  ipc: {
    start(path?: string): Promise<{ success: boolean; path?: string; error?: string }>;
    stop(): Promise<{ success: boolean; error?: string }>;
    getStatus(): Promise<{ success: boolean; isRunning?: boolean; connections?: IPCConnectionInfo[]; error?: string }>;
    
    onConnection(callback: (conn: IPCConnectionInfo) => void): () => void;
    onDisconnection(callback: (data: { connectionId: string; reason: string }) => void): () => void;
  };

  // ─── Remote Sessions ──────────────────────────────────────────────
  remote: {
    enable(): Promise<{ success: boolean; error?: string }>;
    disable(): Promise<{ success: boolean; error?: string }>;
    getStatus(): Promise<{ success: boolean; error?: string }>;
    subscribe(deviceId: string, sessionId: string): Promise<{ success: boolean; error?: string; proxySessionId?: string }>;
    
    onRemoteSessionsChanged(callback: (data: { deviceId: string; type: string }) => void): () => void;
  };

  // ─── Cross-Device Store ───────────────────────────────────────────
  store: {
    subscribe(storeId: string): Promise<CrossDeviceStoreSnapshot | null>;
    unsubscribe(storeId: string): Promise<{ success: boolean }>;
    setLocal(storeId: string, data: unknown): Promise<boolean>;
    getStoreIds(): Promise<string[]>;
    getSnapshot(storeId: string): Promise<CrossDeviceStoreSnapshot | null>;
    
    onChange(callback: (snapshot: CrossDeviceStoreSnapshot) => void): () => void;
  };
}
```

### 4.2 React Context Provider

```typescript
// @avocado/react/src/TerminalBackendContext.tsx
const TerminalBackendContext = createContext<TerminalBackend | null>(null);

export function TerminalBackendProvider({ backend, children }: { backend: TerminalBackend; children: React.ReactNode }) {
  return (
    <TerminalBackendContext.Provider value={backend}>
      {children}
    </TerminalBackendContext.Provider>
  );
}

export function useTerminalBackend(): TerminalBackend {
  const ctx = useContext(TerminalBackendContext);
  if (!ctx) throw new Error('useTerminalBackend must be used within <TerminalBackendProvider>');
  return ctx;
}
```

### 4.3 Platform-Specific Implementations

**Electron** (in vibe-ctl, NOT in avocado):
```typescript
// In the vibe-ctl Electron app:
import type { TerminalBackend } from '@avocado/types';

const electronBackend: TerminalBackend = {
  pty: {
    create: (opts) => window.desktopAPI.pty.create(opts),
    onOutput: (cb) => window.desktopAPI.pty.onOutput(cb),
    // ... maps 1:1 to existing preload API
  },
  // ...
};

// In renderer entry:
<TerminalBackendProvider backend={electronBackend}>
  <App />
</TerminalBackendProvider>
```

**Tauri** (future, e.g., cheeseboard):
```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const tauriBackend: TerminalBackend = {
  pty: {
    create: (opts) => invoke('pty_create', opts),
    onOutput: (cb) => {
      const unlisten = listen('pty:output', (e) => cb(e.payload.terminalId, e.payload.sessionId, e.payload.data));
      return () => { unlisten.then(fn => fn()); };
    },
    // ...
  },
  // ...
};
```

**Direct / In-Process** (for testing or non-Electron Node.js apps):
```typescript
import { PTYSessionManager, TerminalService } from '@avocado/core';

// Create a backend that calls the services directly
// (only works in Node.js where both main and renderer logic coexist)
function createDirectBackend(sessionManager: PTYSessionManager, terminalService: TerminalService): TerminalBackend {
  return {
    pty: {
      create: async (opts) => {
        const session = sessionManager.spawn(opts);
        return { success: true, sessionId: session.id };
      },
      onOutput: (cb) => {
        const handler = ({ sessionId, data }: { sessionId: string; data: Buffer }) => {
          cb('', sessionId, data.toString('base64'));
        };
        sessionManager.on('output', handler);
        return () => sessionManager.off('output', handler);
      },
      // ...
    },
  };
}
```

### 4.4 `NotificationSink` Pattern (Replacing BrowserWindow.send)

The `TerminalStoreSync` currently pushes updates to Electron renderer via `BrowserWindow.getAllWindows().forEach(w => w.webContents.send('store:changed', snapshot))`. This is replaced with a callback:

```typescript
// @avocado/core/src/terminal-store-sync.ts
export interface TerminalStoreSyncOptions {
  localStoreRegistry: LocalStoreRegistry;
  /** Called when store snapshot changes; host (Electron/Tauri) is responsible for delivery */
  onStoreSnapshot?: (storeId: string, snapshot: CrossDeviceStoreSnapshot) => void;
}
```

Electron wires this as:
```typescript
const storeSync = new TerminalStoreSyncImpl({
  localStoreRegistry,
  onStoreSnapshot: (storeId, snapshot) => {
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('store:changed', snapshot));
  },
});
```

---

## 5. Build Configuration

### 5.1 Root `package.json`

```json
{
  "name": "@avocado/root",
  "private": true,
  "packageManager": "pnpm@10.20.0",
  "type": "module",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "vitest run",
    "typecheck": "pnpm -r run typecheck",
    "clean": "pnpm -r run clean",
    "lint": "eslint 'packages/*/src/**/*.ts' 'packages/*/src/**/*.tsx'"
  }
}
```

### 5.2 `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
```

### 5.3 Per-Package Build

**`@avocado/types`**: Pure TypeScript, `tsc` only.
```json
{
  "name": "@avocado/types",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc", "clean": "rm -rf dist" },
  "devDependencies": { "typescript": "~5.9.3" }
}
```

**`@avocado/core`**: TypeScript, Node.js target.
```json
{
  "name": "@avocado/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc", "test": "vitest run", "clean": "rm -rf dist" },
  "dependencies": {
    "@avocado/types": "workspace:*",
    "@xterm/headless": "^6.0.0",
    "@msgpack/msgpack": "^3.1.3"
  },
  "devDependencies": { "typescript": "~5.9.3", "vitest": "^3.0.0" }
}
```

**`@avocado/node-pty`**: TypeScript, native dependency.
```json
{
  "name": "@avocado/node-pty",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc", "clean": "rm -rf dist" },
  "dependencies": {
    "@avocado/types": "workspace:*",
    "@avocado/core": "workspace:*",
    "node-pty": "^1.1.0"
  }
}
```

**`@avocado/react`**: TypeScript + JSX, browser target. Built with `tsc` (no bundler -- consumers bundle).
```json
{
  "name": "@avocado/react",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc", "clean": "rm -rf dist" },
  "dependencies": {
    "@avocado/types": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "xterm": "^5.3.0",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-webgl": "^0.19.0",
    "three": ">=0.160.0",
    "@react-three/fiber": "^9.0.0",
    "@react-three/postprocessing": "^3.0.0"
  },
  "peerDependenciesMeta": {
    "three": { "optional": true },
    "@react-three/fiber": { "optional": true },
    "@react-three/postprocessing": { "optional": true }
  }
}
```

Three.js/R3F are optional peer deps -- only needed if WebGL renderers are used. The `DefaultRenderer` works without them.

**`@avocado/truffle`**: TypeScript, Node.js target.
```json
{
  "name": "@avocado/truffle",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc", "clean": "rm -rf dist" },
  "dependencies": {
    "@avocado/types": "workspace:*",
    "@avocado/core": "workspace:*",
    "@vibecook/truffle": "^0.1.0"
  }
}
```

### 5.4 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

Each package extends this with its own `outDir`, `rootDir`, `composite: true` for project references.

---

## 6. Testing Strategy

### 6.1 `@avocado/types` -- No Tests Needed
Pure type definitions. TypeScript compiler is the test.

### 6.2 `@avocado/core` -- Unit Tests

**PTY Session Manager (without node-pty):**
- Create a `MockPTYSession` that implements `IPTYSession` with controllable emit methods.
- Create a `MockPTYTransport` that implements `IPTYTransport` with send/receive stubs.
- Test: session registration, session lifecycle events, multi-transport management, session lookup by source.

```typescript
// packages/core/src/__tests__/pty-session-manager.test.ts
test('registers proxy session from transport announcement', () => {
  const manager = new PTYSessionManager();
  const transport = new MockPTYTransport('test-transport');
  manager.registerTransport(transport);
  
  transport.emit('sessionAnnounced', {
    sessionId: 'remote-1', pid: 1234, command: '/bin/bash',
    cwd: '/home/user', cols: 80, rows: 24,
  });
  
  const session = manager.getSession('ipc|test-transport|remote-1');
  expect(session).toBeDefined();
  expect(session!.command).toBe('/bin/bash');
});
```

**Terminal Service (without real xterm):**
- `@xterm/headless` runs in Node.js -- use it directly in tests.
- Mock `IPTYSessionSource` to feed output data.
- Test: headless terminal creation, screen content capture, active/passive mode switching, dimension sync.

**Store Layer:**
- `DeviceStoreImpl` can be tested with a mock `IMessageBus`.
- Test: local set, remote update via message, version ordering, conflict resolution, change event emission.

**Wire Codec:**
- Test `encodeMessage` / `decodeFrame` round-trip with various payload types.

**CircularOutputBuffer:**
- Already testable as-is. Test: push, trim, capacity, compact.

### 6.3 `@avocado/node-pty` -- Integration Tests (CI-gated)

- Spawn real processes via `node-pty` on CI.
- Test: session spawn, output capture, write input, resize, kill, exit code.
- These tests should be marked `@integration` and optionally skipped in fast CI.

### 6.4 `@avocado/react` -- Component Tests

- Use `@testing-library/react` with a `MockTerminalBackend`.
- Test: `TerminalBackendProvider` context, hook lifecycle (`usePTYSessions`, `useTerminals`).
- Visual tests for xterm.js components are impractical in jsdom. Use Storybook for visual verification.
- The `MockTerminalBackend` records calls and allows controlled responses:

```typescript
const mockBackend: TerminalBackend = {
  pty: {
    create: vi.fn().mockResolvedValue({ success: true, sessionId: 'test-1' }),
    onOutput: vi.fn().mockReturnValue(() => {}),
    // ...
  },
  // ...
};
```

### 6.5 `@avocado/truffle` -- Integration Tests (requires truffle binary)

- Mock `NapiMeshNode` at the NAPI boundary.
- Test: `TrufflePTYTransport` sends correct envelopes, `TrufflePTYBridge` creates transports on device discovery, `TruffleMessageBus` dispatches correctly.
- Full E2E test (optional, manual): two devices on a tailnet with actual truffle sidecar.

### 6.6 Mock Transport Library

Create `@avocado/core/src/__tests__/mocks/` with reusable mocks:

```typescript
// MockPTYTransport implements IPTYTransport
// MockMessageBus implements IMessageBus  
// MockPTYSession implements IPTYSession
// MockTerminalBackend implements TerminalBackend
```

These mocks are exported from a test-only entry point `@avocado/core/testing` for downstream consumers.

---

## 7. Implementation Order

### Phase 1: Foundation (No truffle dependency needed)

**Step 1.1: Create monorepo scaffold** (1 hour)
- Create `/Users/jamesyong/Projects/project100/p008/avocado/`
- Set up `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`
- Create all 5 package directories with their `package.json` and `tsconfig.json`
- Verify `pnpm install` and `pnpm build` succeed (empty packages)

**Step 1.2: Extract `@avocado/types`** (3-4 hours)
- Copy all interface files, type definitions, constants, utility types
- Resolve the `zod` dependency: convert store-sync Zod schemas to plain validators
- Split `session-id.ts`: pure functions to types, Node.js functions to core
- Split `messages.ts`: types/constructors to types, wire encoding to core
- Ensure `@avocado/types` builds with zero dependencies
- Write no tests (type-only package)

**Step 1.3: Extract `@avocado/core`** (8-10 hours)
- Copy `BasePTYSession`, `ProxyPTYSession`
- Copy `PTYSessionManager` with singleton removal and DI refactor
- Copy `TerminalService` with Electron decoupling
- Copy `TerminalStoreSync` with `NotificationSink` pattern
- Copy bridge interfaces (`IPTYIPCBridge`, `IPTYMeshBridge`)
- Copy `IPCPTYTransport` (this is transport-agnostic, it wraps UDS connections)
- Copy `PTYIPCBridgeImpl`
- Copy store infrastructure: `DeviceStoreImpl`, `LocalDeviceStore`, `LocalStoreRegistry`, `StoreDefinition`
- Copy `RemoteSessionService` base logic, strip mesh-specific code
- Copy wire codec (`encodeMessage`, `decodeFrame`)
- Write mock classes: `MockPTYTransport`, `MockMessageBus`, `MockPTYSession`
- Write unit tests for `PTYSessionManager`, `TerminalService`, `DeviceStoreImpl`, wire codec, `CircularOutputBuffer`

**Step 1.4: Extract `@avocado/node-pty`** (2 hours)
- Copy `LocalPTYSession`
- Create `createNodePtySpawner()` adapter
- Write integration tests (spawn `/bin/echo`, capture output)

**Step 1.5: Extract `@avocado/react`** (6-8 hours)
- Define `TerminalBackend` interface in `@avocado/types`
- Create `TerminalBackendProvider` and `useTerminalBackend` context
- Copy all terminal components, replacing every `window.desktopAPI.*` call with `useTerminalBackend()`
- Copy all terminal hooks with same replacement
- Copy `CrossDeviceStoreClient` and `useCrossDeviceStore` with backend abstraction
- Copy WebGL renderers (no changes needed)
- Copy renderer types
- Write component tests with `MockTerminalBackend`

### Phase 2: Truffle Integration (Requires truffle-napi)

**Step 2.1: Create `TruffleMessageBus`** (3 hours)
- Implement `IMessageBus` wrapping `NapiMeshNode`
- Map `node.onMessage()` to namespace-filtered handlers
- Map `publish()` to `node.sendEnvelope()`
- Map `broadcast()` to `node.broadcastEnvelope()`
- Write tests with mocked `NapiMeshNode`

**Step 2.2: Create `TrufflePTYTransport`** (3 hours)
- Implement `IPTYTransport` using `NapiMeshNode` messaging
- Handle all viewer-side and owner-side operations
- Write tests

**Step 2.3: Create `TrufflePTYBridge`** (4 hours)
- Listen to `NapiMeshNode.onEvent()` for device lifecycle
- Create/destroy `TrufflePTYTransport` instances on connect/disconnect
- Register transports with `PTYSessionManager`
- Route incoming `pty` namespace messages to correct transport
- Write tests

**Step 2.4: Create `TruffleStoreSyncAdapter`** (3 hours)
- Connect `LocalStoreRegistry` stores to `TruffleMessageBus`
- Handle device online/offline events for slice cleanup
- Write tests

**Step 2.5: Create `wireAvocadoToTruffle()` entry point** (2 hours)
- Single function that wires everything together
- Returns cleanup/teardown function
- Write integration test

### Phase 3: Consumer Integration

**Step 3.1: Update vibe-ctl to consume avocado** (4-6 hours)
- Replace `@claude-code-on-the-go/shared` PTY imports with `@avocado/types` and `@avocado/core`
- Create `ElectronTerminalBackend` implementing `TerminalBackend`
- Wire `TerminalBackendProvider` in renderer entry
- Update preload script to delegate to avocado's `TerminalBackend` shape
- Replace mesh service initialization with `wireAvocadoToTruffle()`
- Delete migrated files from vibe-ctl
- Run existing tests to verify no regressions

---

## 8. Risk Mitigation

### 8.1 node-pty Native Dependency Management

**Risk:** node-pty requires native compilation. Different Electron versions need different node-pty builds. Consumers may not need PTY spawning at all.

**Mitigation:**
- `@avocado/node-pty` is an optional, separate package. Consumers who only view remote terminals never install it.
- The `PTYSessionManager` in `@avocado/core` does NOT import node-pty. It accepts an `IPTYSpawner` function via constructor injection:
  ```typescript
  interface IPTYSpawner {
    spawn(config: PTYSpawnConfig): IPty;
  }
  ```
- The `IPty` interface (already defined in shared) abstracts away node-pty's API surface.
- For Electron consumers, document that they must run `electron-rebuild` for node-pty.
- `@avocado/node-pty`'s `package.json` includes `"os"` and `"cpu"` fields for platform-specific builds if needed.

### 8.2 @xterm/headless Version Mismatch (6.x vs renderer 5.x)

**Risk:** `@xterm/headless` is v6.0.0 in the source project. The renderer uses `xterm` v5.3.0 (the DOM terminal). These are different packages from different npm scopes, but they could drift in behavior.

**Mitigation:**
- The headless terminal (v6) and DOM terminal (v5) serve different purposes: headless is for state detection in main process, DOM is for rendering. They do not share instances.
- Pin both versions in avocado's package.json with exact ranges.
- `@avocado/core` depends on `@xterm/headless ^6.0.0`.
- `@avocado/react` peer-depends on `xterm ^5.3.0`.
- If xterm v6 releases a DOM version, the upgrade is isolated to `@avocado/react`.
- Add a compatibility note in the README documenting the version split.

### 8.3 Massive Preload Script Extraction

**Risk:** The vibe-ctl preload script (`preload/index.ts`, ~1000 lines) defines the entire `window.desktopAPI` surface including non-terminal APIs (Claude data, plugins, cache, etc.). Extracting terminal parts could break the preload.

**Mitigation:**
- The preload script stays in vibe-ctl. It is NOT migrated to avocado.
- Avocado's `TerminalBackend` interface is designed to be *implemented by* the preload, not to *replace* it.
- The vibe-ctl preload continues to define `window.desktopAPI` with all existing properties.
- A new file in vibe-ctl creates an `ElectronTerminalBackend` that delegates to `window.desktopAPI`:
  ```typescript
  // vibe-ctl: src/renderer/avocado-bridge.ts
  const electronBackend: TerminalBackend = {
    pty: window.desktopAPI.pty,    // Direct pass-through -- shapes already match
    terminal: window.desktopAPI.terminal,
    ipc: window.desktopAPI.ipc,
    remote: window.desktopAPI.remoteSession,
    store: window.desktopAPI.crossDeviceStore,
  };
  ```
- The `TerminalBackend` interface was specifically designed to match the existing `PtyAPI`, `TerminalAPI`, `IpcAPI`, `RemoteSessionAPI`, and `CrossDeviceStoreAPI` shapes from the preload. The migration is a structural rename, not a rewrite.

### 8.4 Singleton Pattern Replacement with DI

**Risk:** The source codebase uses 6 singletons: `getPTYSessionManager()`, `getTerminalStoreSync()`, `getPTYIPCBridge()`, `getPTYMeshBridge()`, `getRemoteSessionService()`, `getLocalStoreRegistry()`. These are called from IPC handlers, bridges, and services. Removing them requires threading dependencies through constructors.

**Mitigation:**
- Introduce a `AvocadoRuntime` container class that holds all service instances:
  ```typescript
  // @avocado/core/src/runtime.ts
  class AvocadoRuntime {
    readonly sessionManager: PTYSessionManager;
    readonly terminalService: TerminalService;
    readonly terminalStoreSync: ITerminalStoreSync;
    readonly storeRegistry: LocalStoreRegistry;
    readonly ipcBridge: IPTYIPCBridge;
    
    constructor(options: AvocadoRuntimeOptions) {
      this.storeRegistry = new LocalStoreRegistry(options.deviceId, options.messageBus);
      this.sessionManager = new PTYSessionManager(options.spawner);
      this.terminalStoreSync = new TerminalStoreSyncImpl({
        localStoreRegistry: this.storeRegistry,
        onStoreSnapshot: options.onStoreSnapshot,
      });
      this.terminalService = new TerminalService(this.sessionManager, this.terminalStoreSync);
      this.ipcBridge = new PTYIPCBridgeImpl(this.sessionManager);
    }
    
    dispose(): void { /* tear down in reverse order */ }
  }
  ```
- Existing singletons in vibe-ctl can be thin wrappers around `AvocadoRuntime` instance methods during transition:
  ```typescript
  let runtime: AvocadoRuntime;
  export function getPTYSessionManager() { return runtime.sessionManager; }
  ```
- This preserves backward compatibility while the vibe-ctl IPC handlers are gradually migrated.

### 8.5 Three.js Version Coupling

**Risk:** `@avocado/react` uses Three.js for WebGL terminal rendering (`TerminalPlane`, `CRTEffect`, `useTextureSync`). Three.js has breaking changes between minor versions. Pinning to a specific version couples consumers.

**Mitigation:**
- Three.js, `@react-three/fiber`, and `@react-three/postprocessing` are **peer dependencies** with wide ranges (`three: ">=0.160.0"`).
- The WebGL renderers are **optional**. The `DefaultRenderer` works without Three.js.
- If a consumer's Three.js version is incompatible, they simply don't use the WebGL renderer.
- The WebGL renderers use only stable Three.js APIs (textures, planes, shaders). No cutting-edge features.
- R3F v9 (already in use) is stable. The `Canvas`, `useFrame`, and `useThree` APIs have been stable since v8.

### 8.6 Build Order Dependencies

**Risk:** pnpm workspace builds may not respect the correct order.

**Mitigation:**
- Each package declares workspace dependencies (`@avocado/types: "workspace:*"`).
- pnpm automatically builds in dependency order with `pnpm -r run build`.
- Use `tsconfig` project references for incremental builds.
- CI runs `pnpm build` followed by `pnpm test` -- the build step ensures all packages are compiled before tests run.

### 8.7 Breaking the Existing App During Extraction

**Risk:** Extracting files could break vibe-ctl if done incorrectly.

**Mitigation:**
- **Do not delete files from vibe-ctl during extraction.** Copy files to avocado.
- Once avocado is building and tested, create a separate PR that switches vibe-ctl to `import from '@avocado/*'` and deletes the duplicated source files.
- This two-phase approach means vibe-ctl is never broken. The switch-over PR can be tested independently.
- The switch-over PR should be file-by-file, not big-bang. Start with `@avocado/types` imports, then `@avocado/core`, then `@avocado/react`.