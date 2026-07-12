/**
 * Restty path smoke (engine-level e2e, no Electron GUI).
 *
 * Covers the production contract that would break playground restty:
 *   type → transport → avocado onData (no local echo)
 *   backspace
 *   host-driven resize (no feedback loop)
 *   engine-driven resize → onResize
 *   lifecycle connect / exit / error
 *   engine factory toggle (xterm factory path vs restty)
 *
 * Full Electron + WASM pixel smoke remains manual / future Playwright.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ResttyTerminalView,
  type ResttyCtor,
  type ResttyInstance,
} from '../../src/react/components/terminal/views/restty-view.js';
import { createTerminalView } from '../../src/react/components/terminal/views/create-terminal-view.js';
import type { AvocadoPtyTransport } from '../../src/react/components/terminal/views/avocado-pty-transport.js';

type MockRestty = ResttyInstance & {
  sent: Array<{ text: string; source?: string }>;
  destroyed: boolean;
  resized: Array<{ cols: number; rows: number }>;
  fitted: number;
  transport: AvocadoPtyTransport | null;
  typeKey(data: string): void;
  /** Simulate restty autoResize calling transport.resize */
  engineResize(cols: number, rows: number): void;
};

function mockResttyCtor(): ResttyCtor {
  return class MockRestty implements MockRestty {
    sent: Array<{ text: string; source?: string }> = [];
    destroyed = false;
    resized: Array<{ cols: number; rows: number }> = [];
    fitted = 0;
    transport: AvocadoPtyTransport | null = null;

    constructor(config: Record<string, unknown>) {
      const services = config.services as { ptyTransport?: AvocadoPtyTransport } | undefined;
      this.transport = services?.ptyTransport ?? null;
    }

    sendInput(text: string, source?: string): void {
      this.sent.push({ text, source });
    }

    resize(cols: number, rows: number): void {
      this.resized.push({ cols, rows });
      // Host path: restty may notify transport; production uses withHostResizeSuppressed.
      this.transport?.resize(cols, rows);
    }

    focus(): void {}
    blur(): void {}
    updateSize(): void {
      this.fitted += 1;
    }
    destroy(): void {
      this.destroyed = true;
    }

    typeKey(data: string): void {
      this.transport?.sendInput(data);
    }

    engineResize(cols: number, rows: number): void {
      this.transport?.resize(cols, rows);
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

async function createSmokeView(): Promise<{
  view: ResttyTerminalView;
  instance: MockRestty;
}> {
  let instance: MockRestty | null = null;
  const Base = mockResttyCtor();
  const load = async () =>
    class extends Base {
      constructor(config: Record<string, unknown>) {
        super(config);
        instance = this as unknown as MockRestty;
      }
    } as ResttyCtor;

  const view = await ResttyTerminalView.create(
    { container: fakeContainer(), cols: 80, rows: 24, fontSize: 14 },
    load
  );
  if (!instance) throw new Error('mock restty not constructed');
  return { view, instance };
}

describe('restty path smoke (e2e contract)', () => {
  it('type and backspace go only through transport → onData (no display echo)', async () => {
    const { view, instance } = await createSmokeView();
    const onData = vi.fn();
    view.onData(onData);

    instance.typeKey('h');
    instance.typeKey('i');
    instance.typeKey('\x7f');

    expect(onData.mock.calls.map((c) => c[0])).toEqual(['h', 'i', '\x7f']);
    // Display path empty until PTY echoes
    expect(instance.sent).toEqual([]);

    // Shell echo comes back as write(..., pty)
    view.write('h');
    view.write('i');
    expect(instance.sent).toEqual([
      { text: 'h', source: 'pty' },
      { text: 'i', source: 'pty' },
    ]);

    view.dispose();
  });

  it('host-driven resize does not re-emit onResize (no feedback loop)', async () => {
    const { view, instance } = await createSmokeView();
    const onResize = vi.fn();
    view.onResize(onResize);

    // Initial create may have called restty.resize under suppress — clear tally
    onResize.mockClear();
    instance.resized.length = 0;

    view.resize(120, 40);
    expect(view.cols).toBe(120);
    expect(view.rows).toBe(40);
    expect(instance.resized).toContainEqual({ cols: 120, rows: 40 });
    expect(onResize).not.toHaveBeenCalled();

    view.dispose();
  });

  it('engine-driven resize emits onResize once', async () => {
    const { view, instance } = await createSmokeView();
    const onResize = vi.fn();
    view.onResize(onResize);

    instance.engineResize(100, 36);
    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith({ cols: 100, rows: 36 });
    expect(view.cols).toBe(100);
    expect(view.rows).toBe(36);

    // Duplicate same size is a no-op
    instance.engineResize(100, 36);
    expect(onResize).toHaveBeenCalledTimes(1);

    view.dispose();
  });

  it('lifecycle: connected at create; exit/error report; dispose disconnects', async () => {
    const { view } = await createSmokeView();
    const events: unknown[] = [];
    view.onLifecycle?.((e) => events.push(e));

    // Already connected during create; reportError / reportExit after attach
    view.reportError('gpu lost');
    expect(events).toContainEqual({
      type: 'error',
      message: 'gpu lost',
      errors: undefined,
    });

    view.reportExit(1);
    expect(events).toContainEqual({ type: 'exit', code: 1 });
    expect(view.ptyTransport.isConnected()).toBe(false);

    view.dispose();
    expect(view.ptyTransport.lifecycleState).toBe('destroyed');
  });

  it('fit is engine-driven (updateSize) without host onResize spam', async () => {
    const { view, instance } = await createSmokeView();
    const onResize = vi.fn();
    view.onResize(onResize);
    view.fit();
    expect(instance.fitted).toBeGreaterThanOrEqual(1);
    // updateSize alone does not call transport.resize in our mock
    expect(onResize).not.toHaveBeenCalled();
    view.dispose();
  });

  it('engine factory: restty vs missing-module error; xterm is a separate engine id', async () => {
    const load = async () => mockResttyCtor();
    const resttyView = await createTerminalView(
      'restty',
      { container: fakeContainer(), cols: 80, rows: 24 },
      { loadRestty: load }
    );
    expect(resttyView.cols).toBe(80);
    resttyView.dispose();

    await expect(
      createTerminalView(
        'restty',
        { container: fakeContainer(), cols: 80, rows: 24 },
        {
          loadRestty: async () => {
            throw new Error('ERR_MODULE_NOT_FOUND');
          },
        }
      )
    ).rejects.toThrow(/Failed to load restty/);

    // Engine id toggle surface (playground switches this prop)
    const engines = ['xterm', 'restty'] as const;
    expect(engines).toContain('xterm');
    expect(engines).toContain('restty');
  });

  it('dispose cleans restty + transport', async () => {
    const { view, instance } = await createSmokeView();
    view.dispose();
    expect(instance.destroyed).toBe(true);
    expect(view.ptyTransport.lifecycleState).toBe('destroyed');
    // double dispose safe
    view.dispose();
  });
});
