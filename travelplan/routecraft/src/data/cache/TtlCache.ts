import type { ResultCache } from './ResultCache';

export interface TtlCacheOptions {
  /** Time-to-live for each entry, in milliseconds. */
  ttlMs: number;
  /** Maximum number of entries before LRU eviction kicks in. */
  maxEntries: number;
  /** Injectable clock, defaults to `Date.now`. */
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Creates a `ResultCache` with lazy TTL expiry and LRU eviction.
 *
 * - Expiry is checked lazily on `get`/`has` — there are no timers or
 *   `setInterval` sweeps, so `size` may include entries that have expired
 *   but not yet been touched.
 * - Recency is tracked via `Map` insertion order: the map is always kept in
 *   least-recently-used → most-recently-used order, so the first key is the
 *   eviction candidate and re-inserting a key (delete + set) moves it to the
 *   most-recently-used end.
 */
export function createTtlCache<V>(opts: TtlCacheOptions): ResultCache<V> {
  const { ttlMs, maxEntries } = opts;
  const now = opts.now ?? (() => Date.now());
  const store = new Map<string, Entry<V>>();

  function isExpired(entry: Entry<V>): boolean {
    return entry.expiresAt <= now();
  }

  return {
    get(key: string): V | undefined {
      const entry = store.get(key);
      if (entry === undefined) return undefined;
      if (isExpired(entry)) {
        store.delete(key);
        return undefined;
      }
      // Refresh LRU recency: move to most-recently-used position.
      store.delete(key);
      store.set(key, entry);
      return entry.value;
    },

    set(key: string, value: V): void {
      const existed = store.has(key);
      if (existed) {
        // Updating an existing key refreshes recency and never evicts.
        store.delete(key);
        store.set(key, { value, expiresAt: now() + ttlMs });
        return;
      }
      store.set(key, { value, expiresAt: now() + ttlMs });
      if (store.size > maxEntries) {
        const lruKey = store.keys().next().value;
        if (lruKey !== undefined) {
          store.delete(lruKey);
        }
      }
    },

    has(key: string): boolean {
      const entry = store.get(key);
      if (entry === undefined) return false;
      if (isExpired(entry)) {
        store.delete(key);
        return false;
      }
      return true;
    },

    invalidate(key: string): void {
      store.delete(key);
    },

    clear(): void {
      store.clear();
    },

    get size(): number {
      return store.size;
    },
  };
}
