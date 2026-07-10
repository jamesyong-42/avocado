/**
 * In-memory ITerminalStoreBackend for TerminalStoreSync unit tests.
 */

import type { ITerminalStoreBackend, TerminalEntry } from '#core';

export class InMemoryStoreBackend implements ITerminalStoreBackend {
  private localDeviceId: string | null;
  private local: TerminalEntry[] = [];
  private remotes = new Map<string, TerminalEntry[]>();
  private subscribers = new Set<(deviceId: string, type: string) => void>();

  constructor(localDeviceId = 'device-local') {
    this.localDeviceId = localDeviceId;
  }

  getLocalDeviceId(): string | null {
    return this.localDeviceId;
  }

  getLocalTerminals(): TerminalEntry[] {
    return [...this.local];
  }

  setLocalTerminals(terminals: TerminalEntry[]): void {
    this.local = [...terminals];
  }

  getAllTerminals(): Map<string, TerminalEntry[]> {
    const map = new Map<string, TerminalEntry[]>();
    if (this.localDeviceId) {
      map.set(this.localDeviceId, [...this.local]);
    }
    for (const [id, terminals] of this.remotes) {
      map.set(id, [...terminals]);
    }
    return map;
  }

  subscribe(callback: (deviceId: string, type: string) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /** Test helper: publish a remote device's terminals. */
  setRemoteTerminals(deviceId: string, terminals: TerminalEntry[]): void {
    this.remotes.set(deviceId, terminals);
    for (const cb of this.subscribers) {
      cb(deviceId, 'updated');
    }
  }
}
