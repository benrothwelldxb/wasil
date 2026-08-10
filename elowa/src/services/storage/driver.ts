/**
 * Storage driver abstraction.
 *
 * Everything that persists goes through a `StorageDriver`, never through
 * `localStorage` directly. This is the seam that lets a backend replace local
 * persistence later without touching repositories or feature code.
 *
 * Drivers are intentionally tiny and synchronous (localStorage is synchronous);
 * repositories wrap them and the query layer adapts to Promises.
 */
export interface StorageDriver {
  /** Read and JSON-parse a value, or `null` if missing/unparseable. */
  get<T>(key: string): T | null;
  /** JSON-serialise and write a value. */
  set<T>(key: string, value: T): void;
  /** Remove a single key. */
  remove(key: string): void;
  /** All keys currently held by this driver (already stripped of any prefix handling done by the driver). */
  keys(): string[];
}

/** localStorage-backed driver, scoped to a key prefix. */
export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly prefix: string) {}

  private full(key: string): string {
    return `${this.prefix}${key}`;
  }

  get<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(this.full(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      // Corrupt value or storage unavailable — treat as missing rather than throw.
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      window.localStorage.setItem(this.full(key), JSON.stringify(value));
    } catch {
      // Quota exceeded or storage unavailable — swallow so the UI never crashes.
    }
  }

  remove(key: string): void {
    try {
      window.localStorage.removeItem(this.full(key));
    } catch {
      /* no-op */
    }
  }

  keys(): string[] {
    try {
      const out: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
      }
      return out;
    } catch {
      return [];
    }
  }
}

/** In-memory driver for tests and SSR/no-storage environments. */
export class MemoryStorageDriver implements StorageDriver {
  private readonly map = new Map<string, string>();

  get<T>(key: string): T | null {
    const raw = this.map.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    this.map.set(key, JSON.stringify(value));
  }

  remove(key: string): void {
    this.map.delete(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

/** Feature-detect a usable localStorage (private mode / disabled storage safe). */
export function isLocalStorageAvailable(): boolean {
  try {
    const probe = '__elowa_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
