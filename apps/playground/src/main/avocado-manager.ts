/**
 * AvocadoManager — owns every long-lived subsystem in the main process.
 *
 * Inside one class we coordinate:
 *
 *   - Truffle node lifecycle (`createMeshNode`, peer events, auth)
 *   - `@avocado/core`'s `PTYSessionManager` + `TerminalServiceImpl`
 *   - `@avocado/transport-truffle`'s `PTYMeshBridge`, `PTYSyncStore`, and
 *     `RemoteSessionService` (session discovery + remote execution)
 *   - Local PTY spawning via `@avocado/node-pty`'s `LocalPTYSession.spawn`
 *     using our `node-pty`-backed `PTYSpawnFunction`
 *
 * The manager extends `EventEmitter` so `ipc-handlers.ts` can subscribe to
 * higher-level events (`statusChanged`, `authRequired`, `peersChanged`,
 * `ptyOutput`, …) without coupling to raw truffle or avocado internals.
 *
 * Shutdown order (reverse of startup):
 *
 *   1. RemoteSessionService.dispose   — stops handling mesh PTY messages
 *   2. syncStore.stop                 — flushes the PTY sessions slice
 *   3. bridge.dispose                 — disconnects MeshPTYTransports
 *   4. terminalService.shutdown       — destroys virtual terminals
 *   5. sessionManager.dispose         — kills local PTY processes
 *   6. node.stop                      — shuts down truffle + sidecar
 *
 * Errors during shutdown are swallowed — we always want `before-quit` to
 * resolve so Electron can exit cleanly even if one subsystem misbehaves.
 */

import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { app, shell } from 'electron';

import {
  createMeshNode,
  type NapiNode,
  type NapiNodeIdentity,
  type NapiPeer,
  type NapiPeerEvent,
} from '@vibecook/truffle';

import {
  PTYSessionManager,
  createPTYSessionManager,
  TerminalServiceImpl,
  createTerminalService,
  type ProxySessionFactory,
} from '@avocado/core';
import type {
  TerminalService,
} from '@avocado/core';
import { LocalPTYSession } from '@avocado/node-pty';
import {
  PTYMeshBridge,
  PTYSyncStore,
  RemoteSessionService,
} from '@avocado/transport-truffle';
import type { IPTYSession } from '@avocado/types';

import type {
  IPCPtySession,
  IPCTerminalInfo,
  NodeIdentity,
  NodeStatus,
  NodeStatusEvent,
  PeerInfo,
} from '@shared/ipc';

import { createPTYSpawnFunction } from './pty-spawner.js';
import { createProxyPTYSession } from './proxy-pty-session.js';
import { IPCNotifier } from './notifier.js';

// ─── Event map ─────────────────────────────────────────────────────────────

export interface AvocadoManagerEvents {
  statusChanged: (event: NodeStatusEvent) => void;
  authRequired: (url: string) => void;
  peersChanged: (peers: PeerInfo[]) => void;
  ptyOutput: (sessionId: string, data: Buffer) => void;
  ptyExit: (sessionId: string, exitCode: number) => void;
  ptySessionDiscovered: (data: { sessionId: string; source: string }) => void;
  ptySessionLost: (data: {
    sessionId: string;
    source: string;
    reason: string;
  }) => void;
  ptySessionResized: (data: {
    sessionId: string;
    cols: number;
    rows: number;
    source: string;
    origin: string;
  }) => void;
  terminalDestroyed: (terminalId: string, sessionId: string) => void;
}

export declare interface AvocadoManager {
  on<K extends keyof AvocadoManagerEvents>(
    event: K,
    listener: AvocadoManagerEvents[K]
  ): this;
  off<K extends keyof AvocadoManagerEvents>(
    event: K,
    listener: AvocadoManagerEvents[K]
  ): this;
  emit<K extends keyof AvocadoManagerEvents>(
    event: K,
    ...args: Parameters<AvocadoManagerEvents[K]>
  ): boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const APP_ID = 'avocado-playground';
const DEFAULT_COMMAND =
  process.platform === 'win32'
    ? (process.env['COMSPEC'] ?? 'cmd.exe')
    : (process.env['SHELL'] ?? '/bin/bash');

// ─── Implementation ────────────────────────────────────────────────────────

export class AvocadoManager extends EventEmitter {
  // Truffle
  private node: NapiNode | undefined;
  private status: NodeStatus = 'idle';
  private identity: NodeIdentity | undefined;
  private peerCache: Map<string, NapiPeer> = new Map();

  // Avocado core
  private sessionManager: PTYSessionManager | undefined;
  private terminalService: TerminalService | undefined;
  private spawnFn = createPTYSpawnFunction();

  // Mesh transport (Phase D)
  private bridge: PTYMeshBridge | undefined;
  private syncStore: PTYSyncStore | undefined;
  private remoteSessionService: RemoteSessionService | undefined;

  // Forwarding listeners (held so we can detach during teardown)
  private sessionMgrHandlers:
    | {
        output: (evt: { sessionId: string; data: Buffer }) => void;
        exit: (evt: { sessionId: string; exitCode: number }) => void;
        discovered: (evt: {
          session: IPTYSession;
          source: string;
        }) => void;
        lost: (evt: {
          sessionId: string;
          source: string;
          reason: string;
        }) => void;
        resized: (evt: {
          sessionId: string;
          cols: number;
          rows: number;
        }) => void;
      }
    | undefined;
  private terminalSvcHandlers:
    | {
        destroyed: (evt: {
          terminalId: string;
          sessionId: string;
        }) => void;
      }
    | undefined;

  private readonly notifier: IPCNotifier;

  constructor(notifier?: IPCNotifier) {
    super();
    // A null-object notifier works fine in tests and for the current main
    // process which wires in the real one via `setNotifier()` only in
    // production paths. We default to a stubbed one so methods are always
    // defined.
    this.notifier =
      notifier ??
      new IPCNotifier(() => null);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<NodeStatusEvent> {
    if (this.status === 'running' || this.status === 'starting') {
      throw new Error(`Cannot start: manager is already ${this.status}`);
    }
    this.setStatus('starting');

    try {
      // 1. Pin truffle's state directory inside Electron's userData so
      //    restarts reuse the same ULID. The dir must exist before the
      //    Rust side tries to read/write it.
      const deviceName = hostname() || 'avocado-device';
      const stateDir = join(
        app.getPath('userData'),
        'truffle-state',
        APP_ID,
        deviceName
      );
      mkdirSync(stateDir, { recursive: true });

      // 2. Start the truffle node.
      const node = await createMeshNode({
        appId: APP_ID,
        deviceName,
        stateDir,
        autoAuth: false,
        openUrl: (url: string) => {
          void shell.openExternal(url);
        },
        onAuthRequired: (url: string) => {
          this.emit('authRequired', url);
        },
        onPeerChange: (event: NapiPeerEvent) => {
          this.handlePeerChange(event);
        },
      });
      this.node = node;
      this.identity = toNodeIdentity(node.getLocalInfo());

      // Seed the peer cache.
      const initialPeers = await node.getPeers();
      for (const peer of initialPeers) {
        this.peerCache.set(peer.deviceId, peer);
      }

      // 3. Create the core session/terminal stack and wire the proxy
      //    factory. Cast is needed because we intentionally did not import
      //    `ProxySessionFactory` from `@avocado/core` in
      //    `proxy-pty-session.ts` (Risk 5 — keep that file types-only).
      //    The shapes are structurally identical.
      const sessionManager = createPTYSessionManager();
      sessionManager.setProxySessionFactory(
        createProxyPTYSession as unknown as ProxySessionFactory
      );
      this.sessionManager = sessionManager;
      this.terminalService = createTerminalService(sessionManager);

      this.attachSessionManagerListeners(sessionManager);
      this.attachTerminalServiceListeners(this.terminalService);

      // 4. Wire the mesh transport stack on top.
      const bridge = new PTYMeshBridge({ node, sessionManager });
      const syncStore = new PTYSyncStore({ node });
      const service = new RemoteSessionService({
        node,
        sessionManager,
        bridge,
        syncStore,
        notifier: this.notifier,
      });
      this.bridge = bridge;
      this.syncStore = syncStore;
      this.remoteSessionService = service;

      await bridge.initialize();
      await service.enable();

      this.setStatus('running', this.identity);
      this.emitPeersChanged();
      return this.getStatusEvent();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus('error', undefined, message);
      await this.teardown().catch(() => {});
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'idle' || this.status === 'stopping') {
      return;
    }
    this.setStatus('stopping');
    await this.teardown();
    this.setStatus('idle');
  }

  getStatusEvent(): NodeStatusEvent {
    const event: NodeStatusEvent = { status: this.status };
    if (this.identity) {
      event.identity = this.identity;
    }
    return event;
  }

  // ─── Peers ───────────────────────────────────────────────────────────────

  async listPeers(): Promise<PeerInfo[]> {
    if (!this.node) return [];
    const peers = await this.node.getPeers();
    this.peerCache.clear();
    for (const peer of peers) {
      this.peerCache.set(peer.deviceId, peer);
    }
    return peers.map(toPeerInfo);
  }

  // ─── Local PTY ───────────────────────────────────────────────────────────

  spawnLocalSession(opts: {
    cwd: string;
    cols: number;
    rows: number;
  }): { sessionId: string } {
    const sm = this.requireSessionManager();
    const session = LocalPTYSession.spawn(
      this.spawnFn,
      {
        command: DEFAULT_COMMAND,
        args: [],
        cwd: opts.cwd,
        cols: opts.cols,
        rows: opts.rows,
      },
      {
        command: DEFAULT_COMMAND,
        cwd: opts.cwd,
      }
    );
    sm.registerSession(session);
    return { sessionId: session.id };
  }

  destroySession(sessionId: string): boolean {
    const sm = this.requireSessionManager();
    return sm.kill(sessionId);
  }

  writeToSession(sessionId: string, data: string): void {
    const sm = this.requireSessionManager();
    sm.write(sessionId, data);
  }

  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const sm = this.requireSessionManager();
    return sm.resize(sessionId, cols, rows);
  }

  listSessions(): IPCPtySession[] {
    const sm = this.sessionManager;
    if (!sm) return [];
    return sm.getSessions().map((s) => toIPCPtySession(s));
  }

  // ─── Virtual terminals ──────────────────────────────────────────────────

  createVirtualTerminal(
    sessionId: string,
    options: { cols: number; rows: number; mode: string }
  ): string {
    const svc = this.requireTerminalService();
    return svc.createVirtualTerminal(sessionId, {
      cols: options.cols,
      rows: options.rows,
      mode: options.mode === 'passive' ? 'passive' : 'active',
    });
  }

  destroyTerminal(terminalId: string): void {
    const svc = this.requireTerminalService();
    svc.destroyTerminal(terminalId);
  }

  listTerminals(): IPCTerminalInfo[] {
    const svc = this.terminalService;
    if (!svc) return [];
    return svc.getAllTerminals().map((t) => ({
      id: t.id,
      sessionId: t.sessionId,
      type: t.type,
      mode: t.mode,
      cols: t.cols,
      rows: t.rows,
      createdAt: t.createdAt,
    }));
  }

  resizeTerminal(terminalId: string, cols: number, rows: number): boolean {
    const svc = this.requireTerminalService();
    return svc.resize(terminalId, cols, rows);
  }

  setActiveTerminal(terminalId: string): void {
    const svc = this.requireTerminalService();
    svc.setActive(terminalId);
  }

  // ─── Internal: peer events ───────────────────────────────────────────────

  private handlePeerChange(event: NapiPeerEvent): void {
    // 'auth_required' is surfaced through `onAuthRequired` on the options
    // object — skip it here to avoid double-firing.
    if (event.eventType === 'auth_required') {
      return;
    }

    if (event.peer) {
      this.peerCache.set(event.peerId, event.peer);
    } else if (event.eventType === 'left') {
      this.peerCache.delete(event.peerId);
    }
    this.emitPeersChanged();
  }

  private emitPeersChanged(): void {
    const peers = Array.from(this.peerCache.values()).map(toPeerInfo);
    this.emit('peersChanged', peers);
  }

  // ─── Internal: session/terminal event forwarding ────────────────────────

  private attachSessionManagerListeners(sm: PTYSessionManager): void {
    const output = (evt: { sessionId: string; data: Buffer }): void => {
      this.emit('ptyOutput', evt.sessionId, evt.data);
    };
    const exit = (evt: { sessionId: string; exitCode: number }): void => {
      this.emit('ptyExit', evt.sessionId, evt.exitCode);
    };
    const discovered = (evt: {
      session: IPTYSession;
      source: string;
    }): void => {
      this.emit('ptySessionDiscovered', {
        sessionId: evt.session.id,
        source: evt.source,
      });
    };
    const lost = (evt: {
      sessionId: string;
      source: string;
      reason: string;
    }): void => {
      this.emit('ptySessionLost', evt);
    };
    const resized = (evt: {
      sessionId: string;
      cols: number;
      rows: number;
    }): void => {
      const session = sm.getSession(evt.sessionId);
      this.emit('ptySessionResized', {
        sessionId: evt.sessionId,
        cols: evt.cols,
        rows: evt.rows,
        source: session?.source ?? 'local',
        origin: 'local',
      });
    };

    sm.on('output', output);
    sm.on('exit', exit);
    sm.on('sessionDiscovered', discovered);
    sm.on('sessionLost', lost);
    sm.on('sessionResized', resized);

    this.sessionMgrHandlers = { output, exit, discovered, lost, resized };
  }

  private detachSessionManagerListeners(sm: PTYSessionManager): void {
    const h = this.sessionMgrHandlers;
    if (!h) return;
    sm.off('output', h.output);
    sm.off('exit', h.exit);
    sm.off('sessionDiscovered', h.discovered);
    sm.off('sessionLost', h.lost);
    sm.off('sessionResized', h.resized);
    this.sessionMgrHandlers = undefined;
  }

  private attachTerminalServiceListeners(svc: TerminalService): void {
    const destroyed = (evt: {
      terminalId: string;
      sessionId: string;
    }): void => {
      this.emit('terminalDestroyed', evt.terminalId, evt.sessionId);
    };
    svc.on('terminalDestroyed', destroyed);
    this.terminalSvcHandlers = { destroyed };
  }

  private detachTerminalServiceListeners(svc: TerminalService): void {
    const h = this.terminalSvcHandlers;
    if (!h) return;
    svc.off('terminalDestroyed', h.destroyed);
    this.terminalSvcHandlers = undefined;
  }

  // ─── Internal: helpers ───────────────────────────────────────────────────

  private setStatus(
    status: NodeStatus,
    identity?: NodeIdentity,
    error?: string
  ): void {
    this.status = status;
    const event: NodeStatusEvent = { status };
    if (identity) event.identity = identity;
    if (error !== undefined) event.error = error;
    this.emit('statusChanged', event);
  }

  private requireSessionManager(): PTYSessionManager {
    if (!this.sessionManager) {
      throw new Error('PTYSessionManager not started');
    }
    return this.sessionManager;
  }

  private requireTerminalService(): TerminalService {
    if (!this.terminalService) {
      throw new Error('TerminalService not started');
    }
    return this.terminalService;
  }

  private async teardown(): Promise<void> {
    // Detach listeners first so events in the middle of teardown don't
    // bubble out to the renderer (which may already be tearing down itself).
    if (this.sessionManager) {
      this.detachSessionManagerListeners(this.sessionManager);
    }
    if (this.terminalService) {
      this.detachTerminalServiceListeners(this.terminalService);
    }

    // Reverse of startup.
    try {
      if (this.remoteSessionService) {
        await this.remoteSessionService.dispose();
      }
    } catch {
      /* best effort */
    }
    try {
      if (this.syncStore) {
        // PTYSyncStore exposes the store's lifecycle via the underlying
        // NapiSyncedStore; stopping the truffle node (below) tears it
        // down. We don't have an explicit `syncStore.stop()` on the
        // wrapper class, so rely on node.stop().
      }
    } catch {
      /* best effort */
    }
    try {
      if (this.bridge) {
        this.bridge.dispose();
      }
    } catch {
      /* best effort */
    }
    try {
      if (this.terminalService) {
        this.terminalService.shutdown();
      }
    } catch {
      /* best effort */
    }
    try {
      if (this.sessionManager) {
        this.sessionManager.dispose();
      }
    } catch {
      /* best effort */
    }
    try {
      if (this.node) {
        await this.node.stop();
      }
    } catch {
      /* best effort */
    }

    this.remoteSessionService = undefined;
    this.syncStore = undefined;
    this.bridge = undefined;
    this.terminalService = undefined;
    this.sessionManager = undefined;
    this.node = undefined;
    this.identity = undefined;
    this.peerCache.clear();
  }
}

// ─── NAPI → IPC converters ────────────────────────────────────────────────

function toNodeIdentity(info: NapiNodeIdentity): NodeIdentity {
  const out: NodeIdentity = {
    appId: info.appId,
    deviceId: info.deviceId,
    deviceName: info.deviceName,
    tailscaleHostname: info.tailscaleHostname,
    tailscaleId: info.tailscaleId,
  };
  if (info.dnsName !== undefined) out.dnsName = info.dnsName;
  if (info.ip !== undefined) out.ip = info.ip;
  return out;
}

function toPeerInfo(peer: NapiPeer): PeerInfo {
  const out: PeerInfo = {
    deviceId: peer.deviceId,
    deviceName: peer.deviceName,
    tailscaleId: peer.tailscaleId,
    ip: peer.ip,
    online: peer.online,
    wsConnected: peer.wsConnected,
    connectionType: peer.connectionType,
  };
  if (peer.os !== undefined) out.os = peer.os;
  if (peer.lastSeen !== undefined) out.lastSeen = peer.lastSeen;
  return out;
}

function toIPCPtySession(s: IPTYSession): IPCPtySession {
  const out: IPCPtySession = {
    id: s.id,
    source: s.source,
    command: s.command,
    cwd: s.cwd,
    createdAt: s.startedAt.getTime(),
    pid: s.pid,
    cols: s.cols,
    rows: s.rows,
    isRunning: s.isRunning,
  };
  if (s.isFocused !== undefined) out.isFocused = s.isFocused;
  if (s.exitCode !== null && s.exitCode !== undefined) {
    out.exitCode = s.exitCode;
  }
  return out;
}
