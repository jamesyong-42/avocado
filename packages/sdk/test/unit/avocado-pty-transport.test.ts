/**
 * AvocadoPtyTransport — lifecycle, key path, host-vs-engine resize.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AvocadoPtyTransport,
  createAvocadoPtyTransport,
} from '../../src/react/components/terminal/views/avocado-pty-transport.js';

function makeTransport(
  overrides: Partial<{
    onKeyInput: (data: string) => void;
    onEngineResize: (cols: number, rows: number) => void;
    onLifecycle: (e: unknown) => void;
  }> = {}
) {
  const onKeyInput = overrides.onKeyInput ?? vi.fn();
  const onEngineResize = overrides.onEngineResize ?? vi.fn();
  const onLifecycle = overrides.onLifecycle ?? vi.fn();
  const transport = createAvocadoPtyTransport({
    onKeyInput,
    onEngineResize,
    onLifecycle,
  });
  return { transport, onKeyInput, onEngineResize, onLifecycle };
}

describe('AvocadoPtyTransport', () => {
  it('starts idle and is not connected', () => {
    const { transport } = makeTransport();
    expect(transport.lifecycleState).toBe('idle');
    expect(transport.isConnected()).toBe(false);
  });

  it('connect → connected fires callbacks and lifecycle', () => {
    const { transport, onLifecycle } = makeTransport();
    const onConnect = vi.fn();
    transport.connect({
      url: 'avocado://local',
      cols: 80,
      rows: 24,
      callbacks: { onConnect },
    });
    expect(transport.lifecycleState).toBe('connected');
    expect(transport.isConnected()).toBe(true);
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onLifecycle).toHaveBeenCalledWith({ type: 'connected' });
  });

  it('connect is idempotent while already connected', () => {
    const { transport, onLifecycle } = makeTransport();
    const onConnect = vi.fn();
    transport.connect({ callbacks: { onConnect } });
    transport.connect({ callbacks: { onConnect } });
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onLifecycle).toHaveBeenCalledTimes(1);
  });

  it('disconnect → idle fires onDisconnect + lifecycle', () => {
    const { transport, onLifecycle } = makeTransport();
    const onDisconnect = vi.fn();
    transport.connect({ callbacks: { onDisconnect } });
    transport.disconnect();
    expect(transport.lifecycleState).toBe('idle');
    expect(transport.isConnected()).toBe(false);
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onLifecycle).toHaveBeenCalledWith({ type: 'disconnected' });
  });

  it('sendInput forwards only when connected', () => {
    const { transport, onKeyInput } = makeTransport();
    expect(transport.sendInput('a')).toBe(false);
    expect(onKeyInput).not.toHaveBeenCalled();

    transport.connect({ callbacks: {} });
    expect(transport.sendInput('x')).toBe(true);
    expect(onKeyInput).toHaveBeenCalledWith('x');
    expect(transport.sendInput('\x7f')).toBe(true);
    expect(onKeyInput).toHaveBeenCalledWith('\x7f');
    expect(transport.sendInput('')).toBe(true);
    expect(onKeyInput).toHaveBeenCalledTimes(2);
  });

  it('engine resize forwards when connected; blocked when idle', () => {
    const { transport, onEngineResize } = makeTransport();
    expect(transport.resize(100, 40)).toBe(false);
    transport.connect({ callbacks: {} });
    expect(transport.resize(100, 40, { cellW: 8 })).toBe(true);
    expect(onEngineResize).toHaveBeenCalledWith(100, 40, { cellW: 8 });
  });

  it('withHostResizeSuppressed blocks engine resize feedback', () => {
    const { transport, onEngineResize } = makeTransport();
    transport.connect({ callbacks: {} });

    transport.withHostResizeSuppressed(() => {
      expect(transport.resize(90, 30)).toBe(true);
    });
    expect(onEngineResize).not.toHaveBeenCalled();

    // Suppression clears after the block
    transport.resize(91, 31);
    expect(onEngineResize).toHaveBeenCalledWith(91, 31, undefined);
  });

  it('withHostResizeSuppressed restores flag even if fn throws', () => {
    const { transport, onEngineResize } = makeTransport();
    transport.connect({ callbacks: {} });
    expect(() =>
      transport.withHostResizeSuppressed(() => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    transport.resize(80, 24);
    expect(onEngineResize).toHaveBeenCalledOnce();
  });

  it('reportError notifies callbacks + lifecycle without disconnecting', () => {
    const { transport, onLifecycle } = makeTransport();
    const onError = vi.fn();
    transport.connect({ callbacks: { onError } });
    transport.reportError('wasm failed', ['detail']);
    expect(onError).toHaveBeenCalledWith('wasm failed', ['detail']);
    expect(onLifecycle).toHaveBeenCalledWith({
      type: 'error',
      message: 'wasm failed',
      errors: ['detail'],
    });
    expect(transport.isConnected()).toBe(true);
  });

  it('reportExit notifies then disconnects', () => {
    const { transport, onLifecycle } = makeTransport();
    const onExit = vi.fn();
    const onDisconnect = vi.fn();
    transport.connect({ callbacks: { onExit, onDisconnect } });
    transport.reportExit(0);
    expect(onExit).toHaveBeenCalledWith(0);
    expect(onLifecycle).toHaveBeenCalledWith({ type: 'exit', code: 0 });
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(transport.isConnected()).toBe(false);
    expect(transport.lifecycleState).toBe('idle');
  });

  it('destroy is terminal — cannot reconnect', () => {
    const { transport } = makeTransport();
    transport.connect({ callbacks: {} });
    transport.destroy();
    expect(transport.lifecycleState).toBe('destroyed');
    expect(transport.isConnected()).toBe(false);
    expect(() => transport.connect({ callbacks: {} })).toThrow(/cannot connect after destroy/);
  });

  it('destroy when idle is safe', () => {
    const { transport } = makeTransport();
    transport.destroy();
    expect(transport.lifecycleState).toBe('destroyed');
    transport.destroy(); // idempotent
  });

  it('class constructor matches factory', () => {
    const t = new AvocadoPtyTransport({
      onKeyInput: () => {},
      onEngineResize: () => {},
    });
    expect(t.lifecycleState).toBe('idle');
  });
});
