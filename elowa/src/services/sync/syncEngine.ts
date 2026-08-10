/**
 * Sync & merge engine (Phase 3, deterministic core).
 *
 * Offline-first: the local repositories are always the working copy. Sync
 * reconciles them with a `RemoteBackend` snapshot using:
 *   - id-keyed union of record collections (natural de-duplication),
 *   - last-write-wins per record via `updatedAt`,
 *   - tombstones so a delete on one device doesn't reappear from another,
 *   - idempotency: merging the same inputs twice yields the same result.
 *
 * Conflict policy (documented in `docs/SYNC.md`): for the SAME record edited on
 * two devices we take the latest valid `updatedAt`. Records only ever accrue by
 * id, so independent edits to DIFFERENT records both survive. Deletions are
 * versioned (tombstones) and win over an older edit of the same id.
 *
 * The functions here are pure and unit-tested; the repository/store wiring lives
 * in `syncService.ts`.
 */

import type { Tombstone } from '@/domain/models';
import type { RemoteSnapshot } from './remoteBackend';

export interface SyncableRecord {
  id: string;
  updatedAt?: string;
  /** When present and true, this record is a deletion marker. */
  _deleted?: boolean;
}

const time = (r: SyncableRecord): number => (r.updatedAt ? Date.parse(r.updatedAt) : 0);

/** Merge two record lists by id (last-write-wins), honouring tombstones. */
export function mergeById<T extends SyncableRecord>(
  local: readonly T[],
  remote: readonly T[],
  tombstones: readonly Tombstone[],
  collection: string,
): T[] {
  const deleted = new Map<string, number>();
  for (const t of tombstones) {
    if (t.collection === collection) deleted.set(t.recordId, Date.parse(t.deletedAt));
  }

  const byId = new Map<string, T>();
  const consider = (r: T) => {
    const existing = byId.get(r.id);
    if (!existing || time(r) >= time(existing)) byId.set(r.id, r);
  };
  for (const r of local) consider(r);
  for (const r of remote) consider(r);

  // Drop records that a tombstone deletes *at or after* the record's edit time.
  const out: T[] = [];
  for (const r of byId.values()) {
    const del = deleted.get(r.id);
    if (del !== undefined && del >= time(r)) continue;
    out.push(r);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Merge two tombstone lists, keeping the newest per (collection,recordId). */
export function mergeTombstones(a: readonly Tombstone[], b: readonly Tombstone[]): Tombstone[] {
  const byKey = new Map<string, Tombstone>();
  for (const t of [...a, ...b]) {
    const key = `${t.collection}:${t.recordId}`;
    const existing = byKey.get(key);
    if (!existing || Date.parse(t.deletedAt) > Date.parse(existing.deletedAt)) byKey.set(key, t);
  }
  return [...byKey.values()];
}

export interface LocalSnapshot {
  collections: Record<string, SyncableRecord[]>;
  singletons: Record<string, unknown>;
  tombstones: Tombstone[];
}

/**
 * Reconcile a local snapshot with a remote one. Record collections merge by id
 * + LWW + tombstones; singletons are device-preferences and are local-authoritative
 * (local wins) so a device's settings aren't clobbered by an older cloud copy.
 * Idempotent: merge(merge(a,b), b) === merge(a,b).
 */
export function reconcile(local: LocalSnapshot, remote: RemoteSnapshot): LocalSnapshot {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const collectionNames = new Set([...Object.keys(local.collections), ...Object.keys(remote.collections)]);
  const collections: Record<string, SyncableRecord[]> = {};
  for (const name of collectionNames) {
    collections[name] = mergeById(
      (local.collections[name] ?? []) as SyncableRecord[],
      (remote.collections[name] ?? []) as SyncableRecord[],
      tombstones,
      name,
    );
  }
  // Singletons: local wins where present, else fall back to remote.
  const singletons: Record<string, unknown> = { ...remote.singletons, ...local.singletons };
  return { collections, singletons, tombstones };
}

/** Turn a reconciled local snapshot into the remote payload to push. */
export function toRemoteSnapshot(local: LocalSnapshot, revision: number): RemoteSnapshot {
  return {
    collections: local.collections,
    singletons: local.singletons,
    tombstones: local.tombstones,
    revision,
  };
}
