import { describe, it, expect } from 'vitest';
import {
  generateCliSessionId,
  generateLocalSessionId,
  generateSessionId,
  createNamespacedId,
  parseNamespacedId,
  isNamespacedId,
  getOriginalId,
  getConnectionId,
  isValidSource,
  isCliSessionId,
  isLocalSessionId,
  getSocketDir,
  getSocketPath,
} from '#types';

describe('session-id utilities', () => {
  describe('generation', () => {
    it('generateLocalSessionId uses local- prefix and uuid', () => {
      const id = generateLocalSessionId();
      expect(id).toMatch(/^local-[0-9a-f-]{36}$/i);
      expect(isLocalSessionId(id)).toBe(true);
      expect(isCliSessionId(id)).toBe(false);
    });

    it('generateCliSessionId embeds pid', () => {
      const id = generateCliSessionId(4242);
      expect(id.startsWith('cli-4242-')).toBe(true);
      expect(isCliSessionId(id)).toBe(true);
    });

    it('generateSessionId dispatches by source', () => {
      expect(generateSessionId('local')).toMatch(/^local-/);
      expect(generateSessionId('ipc', 99)).toMatch(/^cli-99-/);
      expect(generateSessionId('ws')).toMatch(/^local-/);
    });
  });

  describe('namespaced ids', () => {
    it('create + parse round-trips', () => {
      const ns = createNamespacedId('ws', 'peer-ref:1', 'sess-abc');
      expect(ns).toBe('ws|peer-ref:1|sess-abc');
      expect(parseNamespacedId(ns)).toEqual({
        source: 'ws',
        connectionId: 'peer-ref:1',
        originalId: 'sess-abc',
      });
      expect(isNamespacedId(ns)).toBe(true);
      expect(getOriginalId(ns)).toBe('sess-abc');
      expect(getConnectionId(ns)).toBe('peer-ref:1');
    });

    it('preserves pipes inside originalId', () => {
      const ns = createNamespacedId('ipc', 'conn', 'a|b|c');
      expect(parseNamespacedId(ns)?.originalId).toBe('a|b|c');
    });

    it('returns null for invalid shapes', () => {
      expect(parseNamespacedId('not-namespaced')).toBeNull();
      expect(parseNamespacedId('foo|bar')).toBeNull();
      expect(parseNamespacedId('bogus|x|y')).toBeNull();
      expect(isNamespacedId('local-uuid')).toBe(false);
    });

    it('getOriginalId is identity for plain ids', () => {
      expect(getOriginalId('local-abc')).toBe('local-abc');
      expect(getConnectionId('local-abc')).toBeNull();
    });
  });

  describe('validation + socket paths', () => {
    it('isValidSource accepts only known sources', () => {
      expect(isValidSource('local')).toBe(true);
      expect(isValidSource('ipc')).toBe(true);
      expect(isValidSource('ws')).toBe(true);
      expect(isValidSource('mesh')).toBe(false);
    });

    it('socket helpers are under home', () => {
      expect(getSocketDir()).toMatch(/\.claude-go$/);
      expect(getSocketPath()).toMatch(/desktop\.sock$/);
    });
  });
});
