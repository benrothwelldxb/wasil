/**
 * Remote backend abstraction (Phase 3).
 *
 * elowa's sync layer never talks to a specific cloud vendor directly. It depends
 * on this `RemoteBackend` interface. The production implementation is a managed
 * backend (Supabase — see `docs/BACKEND.md`) reached over HTTPS with row-level
 * security; it is intentionally NOT wired in this web build (no server, no
 * secrets). `LocalMockBackend` stands in so the sync/migration engine is fully
 * exercisable and testable on-device, storing the "cloud" copy in a separate
 * storage namespace. Nothing here claims real cloud backup exists.
 */
import type { Tombstone } from '@/domain/models';
import { LocalStorageDriver, MemoryStorageDriver, isLocalStorageAvailable, type StorageDriver } from '../storage/driver';

/** The shape a backend stores per account: opaque collections keyed by name. */
export interface RemoteSnapshot {
  collections: Record<string, unknown[]>;
  singletons: Record<string, unknown>;
  tombstones: Tombstone[];
  /** Server-side version stamp for optimistic concurrency. */
  revision: number;
}

export interface RemoteBackend {
  readonly id: string;
  /** True when the backend can actually be reached (a real server + auth). */
  isConnected(): boolean;
  pull(accountId: string): Promise<RemoteSnapshot | null>;
  push(accountId: string, snapshot: RemoteSnapshot): Promise<{ revision: number }>;
  /** Remove all cloud data for an account (account deletion). */
  purge(accountId: string): Promise<void>;
}

const EMPTY: RemoteSnapshot = { collections: {}, singletons: {}, tombstones: [], revision: 0 };

/**
 * On-device stand-in "cloud". Simulates a per-account server store using a
 * separate storage prefix so it never collides with the local app data.
 */
export class LocalMockBackend implements RemoteBackend {
  readonly id = 'local-mock';
  private driver: StorageDriver;

  constructor(prefix = 'elowa:cloud:') {
    this.driver = isLocalStorageAvailable() ? new LocalStorageDriver(prefix) : new MemoryStorageDriver();
  }

  isConnected(): boolean {
    return true; // the mock is always reachable
  }

  async pull(accountId: string): Promise<RemoteSnapshot | null> {
    return this.driver.get<RemoteSnapshot>(accountId);
  }

  async push(accountId: string, snapshot: RemoteSnapshot): Promise<{ revision: number }> {
    const next = { ...snapshot, revision: snapshot.revision + 1 };
    this.driver.set(accountId, next);
    return { revision: next.revision };
  }

  async purge(accountId: string): Promise<void> {
    this.driver.remove(accountId);
  }
}

export function emptySnapshot(): RemoteSnapshot {
  return { collections: {}, singletons: {}, tombstones: [], revision: 0 };
}

export { EMPTY as EMPTY_SNAPSHOT };
