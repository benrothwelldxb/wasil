/**
 * Generic cache contract used by the caching layer. Implementations may add
 * TTL expiry and/or LRU eviction (see `TtlCache.ts`) but must honour the
 * recency semantics documented per method below.
 */
export interface ResultCache<V> {
  /**
   * Returns the cached value for `key`, or `undefined` if absent or expired.
   * An expired entry is deleted before returning `undefined`. A hit refreshes
   * the entry's LRU recency (marks it most-recently-used).
   */
  get(key: string): V | undefined;

  /** Inserts or updates the value for `key`. */
  set(key: string, value: V): void;

  /**
   * Returns whether `key` is present and not expired. Does NOT refresh LRU
   * recency. An expired entry is deleted and `false` is returned.
   */
  has(key: string): boolean;

  /** Removes a single entry, if present. */
  invalidate(key: string): void;

  /** Removes all entries. */
  clear(): void;

  /**
   * Current number of stored entries. May include entries that have expired
   * but not yet been lazily purged by a `get`/`has` call — this is
   * acceptable and intentional (no background sweeping is performed).
   */
  readonly size: number;
}
