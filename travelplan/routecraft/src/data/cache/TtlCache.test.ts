import { describe, expect, it } from 'vitest';
import { createTtlCache } from './TtlCache';

/** A controllable clock: `now.value` is read by the cache via `() => now.value`. */
function clock(start = 0): { value: number; now: () => number } {
  const state = { value: start };
  return { get value() { return state.value; }, set value(v: number) { state.value = v; }, now: () => state.value };
}

describe('createTtlCache', () => {
  describe('TTL expiry', () => {
    it('hits within the TTL window', () => {
      const c = clock(0);
      const cache = createTtlCache<string>({ ttlMs: 100, maxEntries: 10, now: c.now });

      cache.set('a', 'value-a');
      c.value = 50;

      expect(cache.get('a')).toBe('value-a');
    });

    it('misses after the entry expires, and the expired entry is deleted', () => {
      const c = clock(0);
      const cache = createTtlCache<string>({ ttlMs: 100, maxEntries: 10, now: c.now });

      cache.set('a', 'value-a');
      c.value = 101;

      expect(cache.get('a')).toBeUndefined();
      // The lazy expiry check on `get` must have deleted the entry, not merely
      // hidden it — `size` reflects the store directly.
      expect(cache.size).toBe(0);
    });

    it('expires exactly at expiresAt (<=), not just strictly after', () => {
      const c = clock(0);
      const cache = createTtlCache<string>({ ttlMs: 100, maxEntries: 10, now: c.now });

      cache.set('a', 'value-a');
      c.value = 100;

      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('has()', () => {
    it('is true within the TTL window and false once expired, deleting the entry', () => {
      const c = clock(0);
      const cache = createTtlCache<string>({ ttlMs: 100, maxEntries: 10, now: c.now });

      cache.set('a', 'value-a');
      c.value = 50;
      expect(cache.has('a')).toBe(true);

      c.value = 200;
      expect(cache.has('a')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('does NOT refresh LRU recency', () => {
      const c = clock(0);
      const cache = createTtlCache<number>({ ttlMs: 10_000, maxEntries: 3, now: c.now });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      // 'a' is the least-recently-used entry at this point.

      expect(cache.has('a')).toBe(true); // must NOT move 'a' to most-recently-used

      cache.set('d', 4); // triggers eviction — should still evict 'a'

      expect(cache.get('a')).toBeUndefined(); // evicted
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
      expect(cache.size).toBe(3);
    });
  });

  describe('get() recency', () => {
    it('DOES refresh LRU recency, changing eviction order', () => {
      const c = clock(0);
      const cache = createTtlCache<number>({ ttlMs: 10_000, maxEntries: 3, now: c.now });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.get('a')).toBe(1); // refreshes 'a' → now 'b' is least-recently-used

      cache.set('d', 4); // triggers eviction — should evict 'b', not 'a'

      expect(cache.get('b')).toBeUndefined(); // evicted
      expect(cache.get('a')).toBe(1);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });
  });

  describe('LRU eviction', () => {
    it('evicts the least-recently-used entry once maxEntries is exceeded by a new key', () => {
      const c = clock(0);
      const cache = createTtlCache<number>({ ttlMs: 10_000, maxEntries: 2, now: c.now });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // over capacity — evicts 'a'

      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });

    it('does not evict when updating an existing key, and refreshes its recency', () => {
      const c = clock(0);
      const cache = createTtlCache<number>({ ttlMs: 10_000, maxEntries: 2, now: c.now });

      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('a', 100); // update, not insert — must not evict, and refreshes 'a'

      expect(cache.size).toBe(2);
      expect(cache.get('a')).toBe(100);

      cache.set('c', 3); // over capacity — 'b' is now the LRU entry, should be evicted

      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('a')).toBe(100);
      expect(cache.get('c')).toBe(3);
    });
  });

  describe('invalidate / clear / size', () => {
    it('invalidate removes a single entry', () => {
      const cache = createTtlCache<number>({ ttlMs: 10_000, maxEntries: 10 });
      cache.set('a', 1);
      cache.set('b', 2);

      cache.invalidate('a');

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.size).toBe(1);
    });

    it('invalidate on a missing key is a no-op', () => {
      const cache = createTtlCache<number>({ ttlMs: 10_000, maxEntries: 10 });
      expect(() => cache.invalidate('missing')).not.toThrow();
      expect(cache.size).toBe(0);
    });

    it('clear removes every entry', () => {
      const cache = createTtlCache<number>({ ttlMs: 10_000, maxEntries: 10 });
      cache.set('a', 1);
      cache.set('b', 2);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
    });

    it('size reflects the number of stored entries', () => {
      const cache = createTtlCache<number>({ ttlMs: 10_000, maxEntries: 10 });
      expect(cache.size).toBe(0);
      cache.set('a', 1);
      expect(cache.size).toBe(1);
      cache.set('b', 2);
      expect(cache.size).toBe(2);
    });
  });

  describe('default clock', () => {
    it('works without an injected `now` (defaults to Date.now)', () => {
      const cache = createTtlCache<string>({ ttlMs: 10_000, maxEntries: 10 });
      cache.set('a', 'value-a');
      expect(cache.get('a')).toBe('value-a');
    });
  });
});
