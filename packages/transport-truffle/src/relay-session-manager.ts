/**
 * RelaySessionManager — tracks the relay side of mesh session sharing.
 *
 * When a remote peer subscribes to one of our local PTY sessions, we create
 * a "relay session" that forwards output from the source session to that
 * peer's `MeshPTYTransport`. Each (sourceSessionId, viewerPeerId) pair has
 * its own relay so we can scope subscriptions and clean up per-peer on
 * disconnect.
 *
 * Ported from vibe-ctl's
 *   packages/desktop/src/main/services/foundation/pty/remote-sessions/relay-session-manager.ts
 *
 * Design note (deviation from vibe-ctl):
 *   vibe-ctl delegates to `createRelaySession` from
 *   `@claude-code-on-the-go/shared`, which wraps a `ProxyPTYSession` with
 *   event plumbing. Avocado doesn't ship a concrete `ProxyPTYSession` —
 *   `BasePTYSession` is the only session primitive in `@avocado/types` and
 *   the app supplies the concrete classes via `ProxySessionFactory`. The
 *   relay side lives entirely inside the owner device and never becomes
 *   a first-class entry in `PTYSessionManager`, so we inline a lightweight
 *   `RelayPTYSession` here that:
 *     - listens for `'output'`/`'resized'`/`'exit'` on the source session
 *     - forwards each event to the viewer via `MeshPTYTransport` owner-side
 *       sends (sendOutput, sendResized, sendSessionEnded)
 *     - disposes when the source exits or the viewer disconnects
 *
 * This keeps the relay logic contained and avoids pulling a ProxyPTYSession
 * concrete class into the transport package.
 *
 * The `ITerminalStoreSync` dependency is currently reserved for future
 * focus/authority coordination — the constructor accepts it for API parity
 * with vibe-ctl, but the v0.1 relay itself is focus-agnostic (cooperative
 * focus, last-write-wins per plan D5). Store-based terminal mode handling
 * stays in RemoteSessionService / the consumer app.
 */

import { EventEmitter } from 'events';
import type { IPTYSession } from '@avocado/types';
import type { ITerminalStoreSync } from '@avocado/core';
import type { MeshPTYTransport } from './mesh-pty-transport.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[RelaySessionManager]';

// ═══════════════════════════════════════════════════════════════════════════
// RELAY PTY SESSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Forwards events from a local source session to a remote viewer.
 *
 * This is an internal helper class — it is not registered with
 * `PTYSessionManager` and is not exposed outside the package. It exists
 * purely to hold the forwarding listeners so they can be detached cleanly
 * on `dispose()`.
 */
export class RelayPTYSession extends EventEmitter {
  readonly id: string;
  readonly sourceSessionId: string;
  readonly viewerPeerId: string;

  private readonly source: IPTYSession;
  private readonly transport: MeshPTYTransport;
  private disposed = false;

  // Listener references retained for removeListener on dispose.
  private readonly onSourceOutput: (data: Buffer) => void;
  private readonly onSourceResized: (cols: number, rows: number) => void;
  private readonly onSourceExit: (code: number, _signal?: string) => void;
  private readonly onSourceDisposed: () => void;
  private readonly onTransportDisconnected: (reason: string) => void;

  constructor(source: IPTYSession, transport: MeshPTYTransport, viewerPeerId: string) {
    super();
    this.source = source;
    this.transport = transport;
    this.sourceSessionId = source.id;
    this.viewerPeerId = viewerPeerId;
    // Relay id just needs to be unique per (session, peer). Use the same
    // composite key the manager uses externally so logs line up.
    this.id = `relay:${source.id}:${viewerPeerId}`;

    // Forward source output to the viewer.
    this.onSourceOutput = (data: Buffer): void => {
      if (this.disposed) return;
      this.transport.sendOutput(source.id, data, viewerPeerId);
    };
    // Forward resizes so the viewer's proxy can update its cached size.
    this.onSourceResized = (cols: number, rows: number): void => {
      if (this.disposed) return;
      this.transport.sendResized(source.id, cols, rows, viewerPeerId);
    };
    // When the source ends, tell the viewer so it can tear down its proxy.
    this.onSourceExit = (code: number): void => {
      if (this.disposed) return;
      this.transport.sendSessionEnded(source.id, code, viewerPeerId);
      this.dispose();
    };
    // If the source is disposed without an explicit exit, still clean up.
    this.onSourceDisposed = (): void => {
      if (this.disposed) return;
      this.dispose();
    };
    // Viewer went away — drop the forwarding listeners immediately.
    this.onTransportDisconnected = (_reason: string): void => {
      if (this.disposed) return;
      this.emit('viewerDisconnected');
      this.dispose();
    };

    source.on('output', this.onSourceOutput);
    source.on('resized', this.onSourceResized);
    source.on('exit', this.onSourceExit);
    source.on('disposed', this.onSourceDisposed);
    transport.on('disconnected', this.onTransportDisconnected);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.source.off('output', this.onSourceOutput);
    this.source.off('resized', this.onSourceResized);
    this.source.off('exit', this.onSourceExit);
    this.source.off('disposed', this.onSourceDisposed);
    this.transport.off('disconnected', this.onTransportDisconnected);
    this.emit('disposed');
    this.removeAllListeners();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RelaySessionManagerEvents {
  relayCreated: (sessionId: string, peerId: string, relay: RelayPTYSession) => void;
  relayDisposed: (sessionId: string, peerId: string) => void;
}

export interface IRelaySessionManager extends EventEmitter {
  createRelay(
    sourceSession: IPTYSession,
    transport: MeshPTYTransport,
    targetPeerId: string
  ): RelayPTYSession;
  getRelay(sessionId: string, peerId: string): RelayPTYSession | null;
  hasRelay(sessionId: string, peerId: string): boolean;
  disposeRelay(sessionId: string, peerId: string): void;
  getRelaysForSession(sessionId: string): Map<string, RelayPTYSession>;
  cleanupForDevice(peerId: string): number;
  dispose(): void;

  on<K extends keyof RelaySessionManagerEvents>(event: K, listener: RelaySessionManagerEvents[K]): this;
  emit<K extends keyof RelaySessionManagerEvents>(
    event: K,
    ...args: Parameters<RelaySessionManagerEvents[K]>
  ): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class RelaySessionManager extends EventEmitter implements IRelaySessionManager {
  // Key format: `${sessionId}:${peerId}` — single map covers lookup by
  // composite key; `getRelaysForSession` scans by prefix.
  private readonly relays = new Map<string, RelayPTYSession>();
  // Reserved for future authority coordination — keeping the field so the
  // wiring contract matches vibe-ctl and a follow-up change can use it
  // without signature churn. Prefixed with `_` so TS strict doesn't flag it.
  private readonly _terminalStoreSync: ITerminalStoreSync | undefined;

  constructor(terminalStoreSync?: ITerminalStoreSync) {
    super();
    this._terminalStoreSync = terminalStoreSync;
  }

  /** Compose the composite relay key. */
  private static key(sessionId: string, peerId: string): string {
    return `${sessionId}:${peerId}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Relay management
  // ─────────────────────────────────────────────────────────────────────────

  createRelay(
    sourceSession: IPTYSession,
    transport: MeshPTYTransport,
    targetPeerId: string
  ): RelayPTYSession {
    const sessionId = sourceSession.id;
    const key = RelaySessionManager.key(sessionId, targetPeerId);

    const existing = this.relays.get(key);
    if (existing && !existing.isDisposed) {
      console.log(`${LOG_PREFIX} relay already exists for ${key}`);
      return existing;
    }

    const relay = new RelayPTYSession(sourceSession, transport, targetPeerId);
    this.relays.set(key, relay);

    relay.on('disposed', () => {
      // Only delete if this is still the current relay — a new one may
      // have replaced it (rare, but possible on rapid resubscribe).
      if (this.relays.get(key) === relay) {
        this.relays.delete(key);
      }
      this.emit('relayDisposed', sessionId, targetPeerId);
    });

    console.log(`${LOG_PREFIX} created relay ${relay.id}`);
    this.emit('relayCreated', sessionId, targetPeerId, relay);
    return relay;
  }

  getRelay(sessionId: string, peerId: string): RelayPTYSession | null {
    return this.relays.get(RelaySessionManager.key(sessionId, peerId)) ?? null;
  }

  hasRelay(sessionId: string, peerId: string): boolean {
    return this.relays.has(RelaySessionManager.key(sessionId, peerId));
  }

  disposeRelay(sessionId: string, peerId: string): void {
    const key = RelaySessionManager.key(sessionId, peerId);
    const relay = this.relays.get(key);
    if (relay) {
      relay.dispose();
      // `.dispose()` emits 'disposed' which removes the entry already, but
      // call .delete() explicitly in case listener ordering ever changes.
      this.relays.delete(key);
    }
  }

  getRelaysForSession(sessionId: string): Map<string, RelayPTYSession> {
    const result = new Map<string, RelayPTYSession>();
    const prefix = `${sessionId}:`;
    for (const [key, relay] of this.relays) {
      if (key.startsWith(prefix)) {
        const peerId = key.slice(prefix.length);
        result.set(peerId, relay);
      }
    }
    return result;
  }

  cleanupForDevice(peerId: string): number {
    const suffix = `:${peerId}`;
    const keysToDelete: string[] = [];
    for (const [key, relay] of this.relays) {
      if (key.endsWith(suffix)) {
        relay.dispose();
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.relays.delete(key);
    }
    if (keysToDelete.length > 0) {
      console.log(
        `${LOG_PREFIX} cleaned up ${keysToDelete.length} relay(s) for peer ${peerId}`
      );
    }
    return keysToDelete.length;
  }

  dispose(): void {
    for (const relay of this.relays.values()) {
      relay.dispose();
    }
    this.relays.clear();
    this.removeAllListeners();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createRelaySessionManager(
  terminalStoreSync?: ITerminalStoreSync
): IRelaySessionManager {
  return new RelaySessionManager(terminalStoreSync);
}
