import { describe, it, expect, vi } from 'vitest';
import { createTerminalStoreSync } from '#core';
import type { TerminalInfo } from '#types';
import { InMemoryStoreBackend } from '../helpers/in-memory-store-backend.js';

function makeTerminal(partial: Partial<TerminalInfo> & Pick<TerminalInfo, 'id' | 'sessionId'>): TerminalInfo {
  return {
    type: 'virtual',
    mode: 'passive',
    cols: 80,
    rows: 24,
    createdAt: Date.now(),
    ...partial,
  };
}

describe('TerminalStoreSync', () => {
  it('registers and unregisters local terminals', () => {
    const backend = new InMemoryStoreBackend('dev-a');
    const sync = createTerminalStoreSync(backend);

    sync.registerTerminal(makeTerminal({ id: 't1', sessionId: 's1', mode: 'active' }), 's1');
    expect(backend.getLocalTerminals()).toHaveLength(1);
    expect(sync.getActiveTerminalForSession('s1')?.id).toBe('t1');

    sync.unregisterTerminal('t1');
    expect(backend.getLocalTerminals()).toHaveLength(0);
    sync.dispose();
  });

  it('setActive enforces one-active-per-session', () => {
    const backend = new InMemoryStoreBackend('dev-a');
    const sync = createTerminalStoreSync(backend);
    const apply = vi.fn();
    sync.setApplyModeCallback?.(apply);

    sync.registerTerminal(makeTerminal({ id: 't1', sessionId: 's1', mode: 'active' }), 's1');
    sync.registerTerminal(makeTerminal({ id: 't2', sessionId: 's1', mode: 'passive' }), 's1');

    sync.setActive('t2');
    const locals = backend.getLocalTerminals();
    expect(locals.find((t) => t.id === 't2')?.mode).toBe('active');
    expect(locals.find((t) => t.id === 't1')?.mode).toBe('passive');
    expect(apply).toHaveBeenCalled();
    sync.dispose();
  });

  it('canDeviceResizeSession checks active device', () => {
    const backend = new InMemoryStoreBackend('dev-a');
    const sync = createTerminalStoreSync(backend);
    sync.registerTerminal(makeTerminal({ id: 't1', sessionId: 's1', mode: 'active' }), 's1');

    expect(sync.canDeviceResizeSession('s1', 'dev-a')).toBe(true);
    expect(sync.canDeviceResizeSession('s1', 'dev-b')).toBe(false);
    expect(sync.getActiveDeviceForSession('s1')).toBe('dev-a');
    expect(sync.canResize('t1')).toBe(true);
    sync.dispose();
  });

  it('CLI terminal registration uses cli: prefix', () => {
    const backend = new InMemoryStoreBackend('dev-a');
    const sync = createTerminalStoreSync(backend);
    const id = sync.registerCliTerminal('sess-1', 80, 24);
    expect(id).toBe('cli:sess-1');
    expect(backend.getLocalTerminals()[0]?.type).toBe('cli');
    expect(backend.getLocalTerminals()[0]?.mode).toBe('active');
    // Idempotent
    expect(sync.registerCliTerminal('sess-1', 80, 24)).toBe(id);
    sync.unregisterCliTerminal(id);
    expect(backend.getLocalTerminals()).toHaveLength(0);
    sync.dispose();
  });

  it('session id mapping', () => {
    const sync = createTerminalStoreSync();
    sync.setSessionIdMapping('proxy|x|orig', 'orig');
    expect(sync.getCanonicalSessionId('proxy|x|orig')).toBe('orig');
    expect(sync.getCanonicalSessionId('plain')).toBe('plain');
    sync.dispose();
  });

  it('remote active terminal forces local passive', () => {
    const backend = new InMemoryStoreBackend('dev-a');
    const sync = createTerminalStoreSync(backend);
    const apply = vi.fn();
    sync.setApplyModeCallback?.(apply);
    const modeChanged = vi.fn();
    sync.on('modeChanged', modeChanged);

    sync.registerTerminal(makeTerminal({ id: 't1', sessionId: 's1', mode: 'active' }), 's1');

    backend.setRemoteTerminals('dev-b', [
      {
        id: 'remote-t',
        sessionId: 's1',
        deviceId: 'dev-b',
        mode: 'active',
        type: 'virtual',
        cols: 80,
        rows: 24,
        createdAt: Date.now(),
      },
    ]);

    expect(backend.getLocalTerminals()[0]?.mode).toBe('passive');
    expect(apply).toHaveBeenCalledWith('t1', 'passive');
    expect(modeChanged).toHaveBeenCalledWith('t1', 'passive');
    sync.dispose();
  });

  it('no-ops safely without backend', () => {
    const sync = createTerminalStoreSync();
    expect(sync.getLocalDeviceId()).toBeNull();
    sync.registerTerminal(makeTerminal({ id: 't', sessionId: 's' }), 's');
    sync.setActive('t');
    expect(sync.canResize('t')).toBe(true);
    expect(sync.canDeviceResizeSession('s', 'x')).toBe(false);
    sync.dispose();
  });
});
