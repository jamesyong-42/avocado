/**
 * PTYSyncStore — session discovery over truffle's SyncedStore primitive.
 *
 * Each device publishes its current list of shareable local PTY sessions
 * to a shared `'avocado-pty-sessions'` store. Peers observe the store via
 * `onChange` and reconcile their proxy sessions accordingly.
 *
 * RFC 022: SyncedStore slices remain keyed by durable ULID (`deviceId`).
 * Local `getLocalInfo().deviceId` is always a real ULID. Remote slice
 * events carry the peer's ULID once identity is known. Live PTY *routing*
 * uses Peer handles / `peer.ref` in `PTYMeshBridge` — this store only does
 * discovery, not message routing.
 *
 * Wire shape stored per device:
 *
 *   {
 *     sessions: RemoteSessionAnnounce[]
 *     updatedAt: number  // unix-ms, set by the writer
 *   }
 *
 * On receive we defensively coerce unknown slice shapes to an empty
 * session list (a peer running a different schema shouldn't crash us).
 */

import { EventEmitter } from 'events';
import type { MeshNode, NapiSyncedStore, NapiSlice, NapiStoreEvent } from '@vibecook/truffle';
import type { RemoteSessionAnnounce } from '#types';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const LOG_PREFIX = '[PTYSyncStore]';

/** Default store id — one namespace per mesh for PTY session discovery. */
export const DEFAULT_PTY_STORE_ID = 'avocado-pty-sessions';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Shape of each device's slice in the PTY sync store. */
export interface PTYSessionsSlice {
  sessions: RemoteSessionAnnounce[];
  updatedAt: number;
}

export interface PTYSyncStoreOptions {
  /** Truffle mesh node (from `createMeshNode`). */
  node: MeshNode;
  /** Override the default store id (useful for tests or isolated meshes). */
  storeId?: string;
}

/**
 * Callback fired when a remote device updates or removes its slice.
 *
 * `deviceId` is the durable ULID of the peer (SyncedStore attribution),
 * not a Tailscale id and not a process-local peer ref.
 */
export type RemoteSessionsChangeCallback = (
  deviceId: string,
  sessions: RemoteSessionAnnounce[] | null
) => void;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Defensively coerce an opaque slice `data` field into a `PTYSessionsSlice`.
 *
 * Peers may run different schema versions; a malformed payload must not
 * throw — we log a warning and fall back to an empty session list.
 */
function coerceSlice(raw: unknown): PTYSessionsSlice {
  if (!raw || typeof raw !== 'object') {
    return { sessions: [], updatedAt: 0 };
  }
  const obj = raw as Partial<PTYSessionsSlice>;
  const sessions = Array.isArray(obj.sessions) ? obj.sessions : [];
  const updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : 0;
  return { sessions, updatedAt };
}

// ═══════════════════════════════════════════════════════════════════════════
// PTY SYNC STORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Thin wrapper around `NapiSyncedStore` for PTY session discovery.
 *
 * Inherits from EventEmitter purely for consumer convenience — the primary
 * API is `onRemoteChange(cb)` and the store's imperative methods.
 */
export class PTYSyncStore extends EventEmitter {
  private readonly node: MeshNode;
  private readonly storeId: string;
  private store: NapiSyncedStore;
  private disposed = false;
  private readonly localDeviceId: string;

  constructor(options: PTYSyncStoreOptions) {
    super();
    this.node = options.node;
    this.storeId = options.storeId ?? DEFAULT_PTY_STORE_ID;
    this.store = this.node.syncedStore(this.storeId);
    // Local identity always has a real ULID (unlike peer.deviceId which
    // may be null until hello). Cache it to filter ourselves out of remote
    // event dispatch without a round-trip per event.
    this.localDeviceId = this.node.getLocalInfo().deviceId;
  }

  /** Store identifier in use (for logs/debugging). */
  getStoreId(): string {
    return this.storeId;
  }

  /** This node's durable ULID (SyncedStore owner key for local slice). */
  getLocalDeviceId(): string {
    return this.localDeviceId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Local writes
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Publish this device's shareable sessions.
   *
   * Pass an empty array to signal "I have nothing to share" — peers will
   * see an empty slice rather than a stale one.
   */
  async setLocalSessions(sessions: RemoteSessionAnnounce[]): Promise<void> {
    if (this.disposed) return;
    const slice: PTYSessionsSlice = {
      sessions,
      updatedAt: Date.now(),
    };
    await this.store.set(slice);
  }

  /** Get the local slice that we published most recently (if any). */
  async getLocalSessions(): Promise<RemoteSessionAnnounce[]> {
    if (this.disposed) return [];
    const raw = await this.store.local();
    if (raw === null || raw === undefined) return [];
    return coerceSlice(raw).sessions;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Remote reads
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Snapshot of all remote peers' session lists.
   *
   * Keyed by durable deviceId (ULID). Excludes the local device.
   * Use `PTYMeshBridge.getTransportByDeviceId` to resolve live routing.
   */
  async getRemoteSessions(): Promise<Map<string, RemoteSessionAnnounce[]>> {
    if (this.disposed) return new Map();
    const slices = await this.store.all();
    const result = new Map<string, RemoteSessionAnnounce[]>();
    for (const slice of slices) {
      if (slice.deviceId === this.localDeviceId) continue;
      result.set(slice.deviceId, coerceSlice(slice.data).sessions);
    }
    return result;
  }

  /** Raw slices from truffle — useful for debugging or advanced consumers. */
  async getAllSlices(): Promise<NapiSlice[]> {
    if (this.disposed) return [];
    return this.store.all();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Subscriptions
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to remote slice changes.
   *
   * The callback fires for `peer_updated` (with decoded sessions) and
   * `peer_removed` (with `null` to signal deletion). `local_changed`
   * events are ignored — the caller is the one who wrote those.
   *
   * Multiple subscribers are supported — `NapiSyncedStore.onChange` is
   * additive, and we also re-emit a `'remoteChange'` event for convenience.
   */
  onRemoteChange(callback: RemoteSessionsChangeCallback): void {
    this.store.onChange((event: NapiStoreEvent) => {
      if (this.disposed) return;

      // Ignore our own local writes — those are reflected synchronously.
      if (event.eventType === 'local_changed') return;

      const deviceId = event.deviceId;
      if (!deviceId) {
        console.warn(`${LOG_PREFIX} store event missing deviceId:`, event.eventType);
        return;
      }
      // Defensively ignore local-device echoes (shouldn't happen, but the
      // NAPI type doesn't forbid it).
      if (deviceId === this.localDeviceId) return;

      if (event.eventType === 'peer_removed') {
        callback(deviceId, null);
        this.emit('remoteChange', deviceId, null);
        return;
      }

      if (event.eventType === 'peer_updated') {
        const slice = coerceSlice(event.data);
        callback(deviceId, slice.sessions);
        this.emit('remoteChange', deviceId, slice.sessions);
        return;
      }

      // Unknown eventType — forward-compat no-op.
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.store.stop();
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} error stopping store:`,
        err instanceof Error ? err.message : err
      );
    }
    this.removeAllListeners();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createPTYSyncStore(options: PTYSyncStoreOptions): PTYSyncStore {
  return new PTYSyncStore(options);
}
