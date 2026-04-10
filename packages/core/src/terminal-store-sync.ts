/**
 * TerminalStoreSync - Abstract interface and base implementation
 *
 * Unlike the original, this does NOT depend on Electron (BrowserWindow)
 * or any specific store implementation. The store access is abstracted
 * behind an interface that consumers implement for their environment.
 *
 * Key responsibilities:
 * - Register/unregister terminals in an abstract store
 * - Handle setActive() with one-active-per-session enforcement
 * - React to remote changes and apply mode updates locally
 */

import { EventEmitter } from 'events';
import type { TerminalInfo, TerminalMode } from './terminal-service.js';

// ===============================================================================
// TYPES
// ===============================================================================

export type TerminalEntryMode = 'active' | 'passive';
export type TerminalEntryType = 'headless' | 'virtual' | 'cli';

export interface TerminalEntry {
  id: string;
  sessionId: string;
  deviceId: string;
  mode: TerminalEntryMode;
  type: TerminalEntryType;
  cols: number;
  rows: number;
  createdAt: number;
}

export interface TerminalsStoreData {
  terminals: TerminalEntry[];
}

export interface TerminalStoreSyncEvents {
  modeChanged: (terminalId: string, mode: TerminalEntryMode) => void;
  remoteTerminalsChanged: (deviceId: string, type: string) => void;
}

// ===============================================================================
// INTERFACE
// ===============================================================================

export interface ITerminalStoreSync extends EventEmitter {
  dispose(): void;
  getLocalDeviceId(): string | null;
  registerTerminal(terminal: TerminalInfo, canonicalSessionId: string): void;
  unregisterTerminal(terminalId: string): void;
  updateTerminalDimensions(terminalId: string, cols: number, rows: number): void;
  setActive(terminalId: string): void;
  registerCliTerminal(sessionId: string, cols: number, rows: number): string;
  unregisterCliTerminal(cliTerminalId: string): void;
  getActiveTerminalForSession(sessionId: string): TerminalEntry | null;
  canResize(terminalId: string): boolean;
  canDeviceResizeSession(sessionId: string, deviceId: string): boolean;
  getActiveDeviceForSession(sessionId: string): string | null;
  setSessionIdMapping(proxySessionId: string, canonicalSessionId: string): void;
  getCanonicalSessionId(sessionId: string): string;

  // Callback for applying mode changes to TerminalService
  setApplyModeCallback?(callback: (terminalId: string, mode: TerminalMode) => void): void;

  on<K extends keyof TerminalStoreSyncEvents>(event: K, listener: TerminalStoreSyncEvents[K]): this;
  emit<K extends keyof TerminalStoreSyncEvents>(
    event: K,
    ...args: Parameters<TerminalStoreSyncEvents[K]>
  ): boolean;
}

// ===============================================================================
// ABSTRACT STORE BACKEND
// ===============================================================================

/**
 * Abstract store backend that consumers implement for their environment.
 * The original used Electron's BrowserWindow + LocalDeviceStore.
 * Implementations could use:
 * - In-memory store (for testing)
 * - WebSocket-synced store (for web apps)
 * - Electron IPC store (for desktop apps)
 */
export interface ITerminalStoreBackend {
  /** Get the local device ID */
  getLocalDeviceId(): string | null;

  /** Get local terminal entries */
  getLocalTerminals(): TerminalEntry[];

  /** Set local terminal entries */
  setLocalTerminals(terminals: TerminalEntry[]): void;

  /** Get all terminal entries across all devices */
  getAllTerminals(): Map<string, TerminalEntry[]>;

  /** Subscribe to remote store changes */
  subscribe(callback: (deviceId: string, type: string) => void): () => void;
}

// ===============================================================================
// IMPLEMENTATION
// ===============================================================================

const LOG_PREFIX = '[TerminalStoreSync]';

export class TerminalStoreSyncImpl extends EventEmitter implements ITerminalStoreSync {
  private storeBackend: ITerminalStoreBackend | null = null;
  private disposed = false;
  private unsubscribeStore: (() => void) | null = null;
  private sessionIdMap = new Map<string, string>();
  private applyModeCallback: ((terminalId: string, mode: TerminalMode) => void) | null = null;

  constructor(storeBackend?: ITerminalStoreBackend) {
    super();
    if (storeBackend) {
      this.storeBackend = storeBackend;
      this.unsubscribeStore = storeBackend.subscribe(this.handleRemoteChange.bind(this));
    }
  }

  setApplyModeCallback(callback: (terminalId: string, mode: TerminalMode) => void): void {
    this.applyModeCallback = callback;
  }

  /** Connect to a store backend after construction */
  setStoreBackend(backend: ITerminalStoreBackend): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
    }
    this.storeBackend = backend;
    this.unsubscribeStore = backend.subscribe(this.handleRemoteChange.bind(this));
  }

  // ---------------------------------------------------------------------------
  // LIFECYCLE
  // ---------------------------------------------------------------------------

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }

    this.sessionIdMap.clear();
    this.removeAllListeners();
  }

  getLocalDeviceId(): string | null {
    return this.storeBackend?.getLocalDeviceId() ?? null;
  }

  // ---------------------------------------------------------------------------
  // TERMINAL OPERATIONS
  // ---------------------------------------------------------------------------

  registerTerminal(terminal: TerminalInfo, canonicalSessionId: string): void {
    if (!this.storeBackend) return;

    const localDeviceId = this.storeBackend.getLocalDeviceId();
    if (!localDeviceId) return;

    const terminalEntry: TerminalEntry = {
      id: terminal.id,
      sessionId: canonicalSessionId,
      deviceId: localDeviceId,
      mode: terminal.mode as TerminalEntryMode,
      type: terminal.type as TerminalEntryType,
      cols: terminal.cols,
      rows: terminal.rows,
      createdAt: terminal.createdAt.getTime(),
    };

    const locals = this.storeBackend.getLocalTerminals();
    this.storeBackend.setLocalTerminals([...locals, terminalEntry]);
    console.log(`${LOG_PREFIX} Registered terminal ${terminal.id.slice(0, 8)} for session ${canonicalSessionId.slice(0, 20)}`);
  }

  unregisterTerminal(terminalId: string): void {
    if (!this.storeBackend) return;

    const locals = this.storeBackend.getLocalTerminals();
    const updated = locals.filter(t => t.id !== terminalId);

    if (updated.length === locals.length) return;

    this.storeBackend.setLocalTerminals(updated);
    console.log(`${LOG_PREFIX} Unregistered terminal ${terminalId.slice(0, 8)}`);
  }

  updateTerminalDimensions(terminalId: string, cols: number, rows: number): void {
    if (!this.storeBackend) return;

    const locals = this.storeBackend.getLocalTerminals();
    const updated = locals.map(t => {
      if (t.id === terminalId) {
        return { ...t, cols, rows };
      }
      return t;
    });

    this.storeBackend.setLocalTerminals(updated);
  }

  // ---------------------------------------------------------------------------
  // FOCUS MANAGEMENT
  // ---------------------------------------------------------------------------

  setActive(terminalId: string): void {
    if (!this.storeBackend) return;

    const locals = this.storeBackend.getLocalTerminals();
    const terminal = locals.find(t => t.id === terminalId);
    if (!terminal) return;
    if (terminal.mode === 'active') return;

    const sessionId = terminal.sessionId;
    const modeChanges: Array<{ terminalId: string; newMode: TerminalEntryMode }> = [];

    const updated = locals.map(t => {
      if (t.sessionId === sessionId) {
        const newMode = (t.id === terminalId ? 'active' : 'passive') as TerminalEntryMode;
        if (t.mode !== newMode) {
          modeChanges.push({ terminalId: t.id, newMode });
        }
        return { ...t, mode: newMode };
      }
      return t;
    });

    this.storeBackend.setLocalTerminals(updated);

    if (this.applyModeCallback) {
      for (const change of modeChanges) {
        this.applyModeCallback(change.terminalId, change.newMode);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CLI TERMINAL MANAGEMENT
  // ---------------------------------------------------------------------------

  registerCliTerminal(sessionId: string, cols: number, rows: number): string {
    const cliTerminalId = `cli:${sessionId}`;

    if (!this.storeBackend) return cliTerminalId;

    const localDeviceId = this.storeBackend.getLocalDeviceId();
    if (!localDeviceId) return cliTerminalId;

    const locals = this.storeBackend.getLocalTerminals();
    const existing = locals.find(t => t.id === cliTerminalId);
    if (existing) return cliTerminalId;

    const terminalEntry: TerminalEntry = {
      id: cliTerminalId,
      sessionId,
      deviceId: localDeviceId,
      mode: 'active',
      type: 'cli',
      cols,
      rows,
      createdAt: Date.now(),
    };

    this.storeBackend.setLocalTerminals([...locals, terminalEntry]);
    console.log(`${LOG_PREFIX} Registered CLI terminal ${cliTerminalId}`);

    return cliTerminalId;
  }

  unregisterCliTerminal(cliTerminalId: string): void {
    this.unregisterTerminal(cliTerminalId);
  }

  // ---------------------------------------------------------------------------
  // QUERY
  // ---------------------------------------------------------------------------

  getActiveTerminalForSession(sessionId: string): TerminalEntry | null {
    if (!this.storeBackend) return null;

    const allTerminals = this.storeBackend.getAllTerminals();
    for (const [, terminals] of allTerminals) {
      const terminal = terminals.find(
        t => t.sessionId === sessionId && t.mode === 'active'
      );
      if (terminal) return terminal;
    }
    return null;
  }

  canResize(terminalId: string): boolean {
    if (!this.storeBackend) return true;

    const locals = this.storeBackend.getLocalTerminals();
    const terminal = locals.find(t => t.id === terminalId);
    if (!terminal) return true;

    return terminal.mode === 'active';
  }

  canDeviceResizeSession(sessionId: string, deviceId: string): boolean {
    if (!this.storeBackend) return false;

    const allTerminals = this.storeBackend.getAllTerminals();
    for (const [, terminals] of allTerminals) {
      for (const terminal of terminals) {
        if (terminal.sessionId === sessionId && terminal.mode === 'active') {
          return terminal.deviceId === deviceId;
        }
      }
    }
    return false;
  }

  getActiveDeviceForSession(sessionId: string): string | null {
    if (!this.storeBackend) return null;

    const allTerminals = this.storeBackend.getAllTerminals();
    for (const [, terminals] of allTerminals) {
      for (const terminal of terminals) {
        if (terminal.sessionId === sessionId && terminal.mode === 'active') {
          return terminal.deviceId;
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // SESSION ID MAPPING
  // ---------------------------------------------------------------------------

  setSessionIdMapping(proxySessionId: string, canonicalSessionId: string): void {
    this.sessionIdMap.set(proxySessionId, canonicalSessionId);
  }

  getCanonicalSessionId(sessionId: string): string {
    return this.sessionIdMap.get(sessionId) ?? sessionId;
  }

  // ---------------------------------------------------------------------------
  // REMOTE CHANGE HANDLING
  // ---------------------------------------------------------------------------

  private handleRemoteChange(deviceId: string, type: string): void {
    if (!this.storeBackend) return;

    // Check if any remote terminal became active for sessions we have terminals for
    const allTerminals = this.storeBackend.getAllTerminals();
    const localDeviceId = this.storeBackend.getLocalDeviceId();

    for (const [remoteDeviceId, terminals] of allTerminals) {
      if (remoteDeviceId === localDeviceId) continue;

      for (const remote of terminals) {
        if (remote.mode === 'active') {
          this.makeLocalTerminalsPassive(remote.sessionId, remote.id);
        }
      }
    }

    this.emit('remoteTerminalsChanged', deviceId, type);
  }

  private makeLocalTerminalsPassive(sessionId: string, exceptTerminalId: string): void {
    if (!this.storeBackend) return;

    const locals = this.storeBackend.getLocalTerminals();
    let madePassive = false;

    const updated = locals.map(t => {
      if (t.sessionId === sessionId && t.mode === 'active' && t.id !== exceptTerminalId) {
        madePassive = true;

        if (this.applyModeCallback) {
          this.applyModeCallback(t.id, 'passive');
        }

        this.emit('modeChanged', t.id, 'passive');

        return { ...t, mode: 'passive' as TerminalEntryMode };
      }
      return t;
    });

    if (madePassive) {
      this.storeBackend.setLocalTerminals(updated);
    }
  }
}

// ===============================================================================
// FACTORY
// ===============================================================================

export function createTerminalStoreSync(storeBackend?: ITerminalStoreBackend): ITerminalStoreSync {
  return new TerminalStoreSyncImpl(storeBackend);
}
