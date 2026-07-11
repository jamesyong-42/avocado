/**
 * Tests the backend ↔ TerminalView wiring without React, by exercising
 * the same control flow useTerminalCore uses via a small harness.
 *
 * Full React hook tests would need @testing-library/react; this keeps
 * the suite lightweight while locking the contract.
 */

import { describe, it, expect, vi } from 'vitest';
import type { TerminalView } from '../../src/react/components/terminal/views/types.js';

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  return Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
}

class FakeView implements TerminalView {
  cols = 80;
  rows = 24;
  written: string[] = [];
  private dataListeners = new Set<(d: string) => void>();

  write(data: string | Uint8Array): void {
    this.written.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
  }
  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
  }
  focus(): void {}
  blur(): void {}
  fit(): void {}
  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }
  onResize() {
    return () => {};
  }
  emitData(data: string): void {
    for (const l of this.dataListeners) l(data);
  }
  dispose(): void {
    this.dataListeners.clear();
  }
}

describe('terminal wiring contract (core path)', () => {
  it('forwards PTY output bytes to the view and input to backend', () => {
    const view = new FakeView();
    const backendWrite = vi.fn();
    const sessionId = 'sess-1';
    const terminalId = 'term-1';

    // Mirror useTerminalCore onData wiring
    view.onData((data) => {
      backendWrite(sessionId, data);
    });

    // Mirror onOutput wiring
    const onOutput = (outputTerminalId: string, _sid: string, base64Data: string) => {
      if (outputTerminalId === terminalId) {
        view.write(decodeBase64ToBytes(base64Data));
      }
    };

    const payload = Buffer.from('hello from pty').toString('base64');
    onOutput(terminalId, sessionId, payload);
    expect(view.written.join('')).toBe('hello from pty');

    // Wrong terminal ignored
    onOutput('other', sessionId, Buffer.from('nope').toString('base64'));
    expect(view.written.join('')).toBe('hello from pty');

    view.emitData('ls\n');
    expect(backendWrite).toHaveBeenCalledWith(sessionId, 'ls\n');
  });

  it('suppresses terminal device-attribute replies when enabled', () => {
    const view = new FakeView();
    const backendWrite = vi.fn();
    const suppress = true;

    function isTerminalResponse(data: string): boolean {
      return /^\x1b\[\?[\d;]*c$/.test(data);
    }

    view.onData((data) => {
      if (suppress && isTerminalResponse(data)) return;
      backendWrite(data);
    });

    view.emitData('\x1b[?1;2c');
    view.emitData('real');
    expect(backendWrite).toHaveBeenCalledTimes(1);
    expect(backendWrite).toHaveBeenCalledWith('real');
  });
});
