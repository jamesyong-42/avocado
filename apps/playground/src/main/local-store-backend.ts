/**
 * In-memory ITerminalStoreBackend for the playground.
 *
 * This replaces the cross-device store backend that the original used
 * (which was backed by Electron's LocalDeviceStore + SyncedStore).
 * For local-only operation, an in-memory store is sufficient — it still
 * enables TerminalStoreSync's one-active-per-session enforcement and
 * mode cascading via applyModeCallback.
 */

import type { ITerminalStoreBackend, TerminalEntry } from '@vibecook/avocado-sdk';

export class LocalStoreBackend implements ITerminalStoreBackend {
  private localDeviceId: string;
  private localTerminals: TerminalEntry[] = [];
  private listeners: Set<(deviceId: string, type: string) => void> = new Set();

  constructor(localDeviceId: string) {
    this.localDeviceId = localDeviceId;
  }

  getLocalDeviceId(): string {
    return this.localDeviceId;
  }

  getLocalTerminals(): TerminalEntry[] {
    return [...this.localTerminals];
  }

  setLocalTerminals(terminals: TerminalEntry[]): void {
    this.localTerminals = terminals;
    // Notify subscribers of local change
    for (const listener of this.listeners) {
      listener(this.localDeviceId, 'local_changed');
    }
  }

  getAllTerminals(): Map<string, TerminalEntry[]> {
    const map = new Map<string, TerminalEntry[]>();
    map.set(this.localDeviceId, [...this.localTerminals]);
    return map;
  }

  subscribe(callback: (deviceId: string, type: string) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}
