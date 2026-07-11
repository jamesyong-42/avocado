/**
 * TerminalView adapters + factory — unit tests with fakes / mocks.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  TerminalView,
  TerminalViewCreateOptions,
} from '../../src/react/components/terminal/views/types.js';
import { createTerminalView } from '../../src/react/components/terminal/views/create-terminal-view.js';
import {
  ResttyTerminalView,
  type ResttyCtor,
  type ResttyInstance,
} from '../../src/react/components/terminal/views/restty-view.js';

/** In-memory TerminalView for contract tests. */
class FakeView implements TerminalView {
  cols: number;
  rows: number;
  written: Array<string | Uint8Array> = [];
  disposed = false;
  private dataListeners = new Set<(d: string) => void>();
  private resizeListeners = new Set<(s: { cols: number; rows: number }) => void>();

  constructor(cols = 80, rows = 24) {
    this.cols = cols;
    this.rows = rows;
  }

  write(data: string | Uint8Array): void {
    this.written.push(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    for (const l of this.resizeListeners) l({ cols, rows });
  }

  focus(): void {}
  blur(): void {}
  fit(): void {}

  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onResize(listener: (size: { cols: number; rows: number }) => void) {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  emitData(data: string): void {
    for (const l of this.dataListeners) l(data);
  }

  dispose(): void {
    this.disposed = true;
    this.dataListeners.clear();
    this.resizeListeners.clear();
  }
}

type PtyTransportMock = {
  connect: (opts: { callbacks: { onConnect?: () => void } }) => void;
  disconnect: () => void;
  sendInput: (data: string) => boolean;
  resize: (cols: number, rows: number) => boolean;
  isConnected: () => boolean;
  destroy: () => void;
};

function mockResttyCtor(): ResttyCtor {
  return class MockRestty implements ResttyInstance {
    sent: Array<{ text: string; source?: string }> = [];
    destroyed = false;
    ptyTransport: PtyTransportMock | null = null;

    constructor(config: Record<string, unknown>) {
      const services = config.services as { ptyTransport?: PtyTransportMock } | undefined;
      this.ptyTransport = services?.ptyTransport ?? null;
    }

    sendInput(text: string, source?: string): void {
      this.sent.push({ text, source });
    }

    resize(_cols: number, _rows: number): void {}
    focus(): void {}
    blur(): void {}
    updateSize(): void {}
    destroy(): void {
      this.destroyed = true;
      this.ptyTransport?.destroy();
    }

    /** Simulate a key through the transport path (as restty does when connected). */
    typeKey(data: string): void {
      this.ptyTransport?.sendInput(data);
    }
  };
}

function fakeContainer(): HTMLElement {
  return {
    tagName: 'DIV',
    style: {} as CSSStyleDeclaration,
    replaceChildren: () => {},
  } as unknown as HTMLElement;
}

describe('TerminalView fake contract', () => {
  it('write / resize / onData / dispose', () => {
    const v = new FakeView(40, 12);
    const onData = vi.fn();
    const onResize = vi.fn();
    const offData = v.onData(onData);
    v.onResize(onResize);

    v.write('hi');
    expect(v.written).toEqual(['hi']);
    v.emitData('key');
    expect(onData).toHaveBeenCalledWith('key');
    v.resize(100, 30);
    expect(onResize).toHaveBeenCalledWith({ cols: 100, rows: 30 });
    expect(v.cols).toBe(100);

    offData();
    v.emitData('ignored');
    expect(onData).toHaveBeenCalledTimes(1);

    v.dispose();
    expect(v.disposed).toBe(true);
  });
});

describe('createTerminalView factory', () => {
  it('creates restty view via injectable loader', async () => {
    const Ctor = mockResttyCtor();
    const load = vi.fn(async () => Ctor);
    const container = fakeContainer();

    const view = await createTerminalView(
      'restty',
      { container, cols: 100, rows: 40, fontSize: 14 },
      { loadRestty: load }
    );

    expect(load).toHaveBeenCalledOnce();
    view.write('hello');
    view.resize(120, 40);
    expect(view.cols).toBe(120);
    view.dispose();
  });

  it('surfaces a clear error when restty cannot load', async () => {
    const container = fakeContainer();
    const load = vi.fn(async () => {
      throw new Error('module not found');
    });

    await expect(
      createTerminalView(
        'restty',
        { container, cols: 80, rows: 24 },
        { loadRestty: load }
      )
    ).rejects.toThrow(/Failed to load restty/);
  });
});

describe('ResttyTerminalView', () => {
  it('writes PTY output as source pty (display path)', async () => {
    let instance: InstanceType<ReturnType<typeof mockResttyCtor>> | null = null;
    const Ctor = mockResttyCtor();
    const load = async () =>
      class extends Ctor {
        constructor(config: Record<string, unknown>) {
          super(config);
          instance = this as InstanceType<ReturnType<typeof mockResttyCtor>>;
        }
      } as ResttyCtor;

    const view = await ResttyTerminalView.create(
      { container: fakeContainer(), cols: 80, rows: 24 },
      load
    );

    view.write(new Uint8Array([0x61, 0x62]));
    view.write('cd');
    expect(instance?.sent).toEqual([
      { text: 'ab', source: 'pty' },
      { text: 'cd', source: 'pty' },
    ]);

    view.resize(90, 28);
    expect(view.cols).toBe(90);
    view.dispose();
    expect(instance?.destroyed).toBe(true);
  });

  it('forwards keys via PtyTransport without local echo write', async () => {
    let instance: InstanceType<ReturnType<typeof mockResttyCtor>> | null = null;
    const Ctor = mockResttyCtor();
    const load = async () =>
      class extends Ctor {
        constructor(config: Record<string, unknown>) {
          super(config);
          instance = this as InstanceType<ReturnType<typeof mockResttyCtor>>;
        }
      } as ResttyCtor;

    const view = await ResttyTerminalView.create(
      { container: fakeContainer(), cols: 80, rows: 24 } satisfies TerminalViewCreateOptions,
      load
    );

    const onData = vi.fn();
    view.onData(onData);

    // Key via transport (what restty does when isConnected)
    instance!.typeKey('x');
    expect(onData).toHaveBeenCalledWith('x');
    // Must NOT have written to display path
    expect(instance!.sent.filter((s) => s.source !== 'pty')).toEqual([]);
    expect(instance!.sent).toEqual([]);

    // Backspace sequence
    instance!.typeKey('\x7f');
    expect(onData).toHaveBeenCalledWith('\x7f');

    view.dispose();
  });

  it('installs a connected ptyTransport so restty will not local-echo', async () => {
    let installedTransport: { isConnected: () => boolean } | null = null;
    const Ctor = mockResttyCtor();
    const load = async () =>
      class extends Ctor {
        constructor(config: Record<string, unknown>) {
          super(config);
          const services = config.services as {
            ptyTransport?: { isConnected: () => boolean };
          };
          installedTransport = services?.ptyTransport ?? null;
        }
      } as ResttyCtor;

    const view = await ResttyTerminalView.create(
      { container: fakeContainer(), cols: 80, rows: 24 },
      load
    );

    expect(installedTransport).not.toBeNull();
    expect(installedTransport!.isConnected()).toBe(true);
    view.dispose();
  });

  it('host-driven resize does not re-emit onResize', async () => {
    const Ctor = mockResttyCtor();
    const load = async () => Ctor;
    const view = await ResttyTerminalView.create(
      { container: fakeContainer(), cols: 80, rows: 24 },
      load
    );
    const onResize = vi.fn();
    view.onResize(onResize);
    view.resize(110, 35);
    expect(view.cols).toBe(110);
    expect(onResize).not.toHaveBeenCalled();
    view.dispose();
  });

  it('exposes lifecycle via onLifecycle + reportExit', async () => {
    const Ctor = mockResttyCtor();
    const load = async () => Ctor;
    const view = await ResttyTerminalView.create(
      { container: fakeContainer(), cols: 80, rows: 24 },
      load
    );
    const events: unknown[] = [];
    view.onLifecycle?.((e) => events.push(e));
    view.reportError('test');
    view.reportExit(0);
    expect(events.some((e) => (e as { type: string }).type === 'error')).toBe(true);
    expect(events.some((e) => (e as { type: string }).type === 'exit')).toBe(true);
    view.dispose();
  });
});
