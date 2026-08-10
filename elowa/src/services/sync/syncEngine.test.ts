import { describe, it, expect } from 'vitest';
import { mergeById, mergeTombstones, reconcile, toRemoteSnapshot, type LocalSnapshot } from './syncEngine';
import type { RemoteSnapshot } from './remoteBackend';
import type { Tombstone } from '@/domain/models';

const rec = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({ id, updatedAt, ...extra });

describe('mergeById', () => {
  it('unions records by id (independent edits both survive)', () => {
    const local = [rec('a', '2026-01-01T00:00:00Z')];
    const remote = [rec('b', '2026-01-01T00:00:00Z')];
    const out = mergeById(local, remote, [], 'checkIns');
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('last-write-wins for the SAME id by updatedAt', () => {
    const local = [rec('a', '2026-01-02T00:00:00Z', { v: 'local' })];
    const remote = [rec('a', '2026-01-01T00:00:00Z', { v: 'remote' })];
    const out = mergeById(local, remote, [], 'checkIns');
    expect(out).toHaveLength(1);
    expect((out[0] as unknown as { v: string }).v).toBe('local');
  });

  it('remote wins when it is newer', () => {
    const local = [rec('a', '2026-01-01T00:00:00Z', { v: 'local' })];
    const remote = [rec('a', '2026-02-01T00:00:00Z', { v: 'remote' })];
    const out = mergeById(local, remote, [], 'checkIns');
    expect((out[0] as unknown as { v: string }).v).toBe('remote');
  });

  it('drops a record deleted at or after its edit time (tombstone wins)', () => {
    const local = [rec('a', '2026-01-01T00:00:00Z')];
    const tombstones: Tombstone[] = [{ collection: 'checkIns', recordId: 'a', deletedAt: '2026-01-02T00:00:00Z' }];
    expect(mergeById(local, [], tombstones, 'checkIns')).toEqual([]);
  });

  it('keeps a record edited AFTER the tombstone (re-creation wins)', () => {
    const local = [rec('a', '2026-01-03T00:00:00Z')];
    const tombstones: Tombstone[] = [{ collection: 'checkIns', recordId: 'a', deletedAt: '2026-01-02T00:00:00Z' }];
    expect(mergeById(local, [], tombstones, 'checkIns')).toHaveLength(1);
  });

  it('scopes tombstones to their collection', () => {
    const local = [rec('a', '2026-01-01T00:00:00Z')];
    const tombstones: Tombstone[] = [{ collection: 'periods', recordId: 'a', deletedAt: '2026-02-01T00:00:00Z' }];
    // Tombstone is for a different collection, so the checkIn survives.
    expect(mergeById(local, [], tombstones, 'checkIns')).toHaveLength(1);
  });
});

describe('mergeTombstones', () => {
  it('keeps the newest tombstone per collection:recordId', () => {
    const a: Tombstone[] = [{ collection: 'checkIns', recordId: 'x', deletedAt: '2026-01-01T00:00:00Z' }];
    const b: Tombstone[] = [{ collection: 'checkIns', recordId: 'x', deletedAt: '2026-02-01T00:00:00Z' }];
    const out = mergeTombstones(a, b);
    expect(out).toHaveLength(1);
    expect(out[0]!.deletedAt).toBe('2026-02-01T00:00:00Z');
  });
});

const emptyRemote: RemoteSnapshot = { collections: {}, singletons: {}, tombstones: [], revision: 0 };

describe('reconcile', () => {
  const local: LocalSnapshot = {
    collections: { checkIns: [rec('a', '2026-01-02T00:00:00Z', { v: 'local' })] },
    singletons: { preferences: { theme: 'calm' } },
    tombstones: [],
  };
  const remote: RemoteSnapshot = {
    collections: { checkIns: [rec('a', '2026-01-01T00:00:00Z', { v: 'remote' }), rec('b', '2026-01-01T00:00:00Z')] },
    singletons: { preferences: { theme: 'old' }, tracking: { pinned: ['x'] } },
    tombstones: [],
    revision: 3,
  };

  it('migration preserves local history and unions remote records', () => {
    const merged = reconcile(local, remote);
    expect(merged.collections.checkIns!.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect((merged.collections.checkIns!.find((r) => r.id === 'a') as unknown as { v: string }).v).toBe('local');
  });

  it('local singletons win, remote-only singletons fall through', () => {
    const merged = reconcile(local, remote);
    expect((merged.singletons.preferences as { theme: string }).theme).toBe('calm');
    expect((merged.singletons.tracking as { pinned: string[] }).pinned).toEqual(['x']);
  });

  it('is idempotent: reconcile(reconcile(l,r), r) === reconcile(l,r)', () => {
    const once = reconcile(local, remote);
    const twice = reconcile(once, toRemoteSnapshot(reconcile(local, remote), remote.revision));
    expect(twice.collections).toEqual(once.collections);
    expect(twice.tombstones).toEqual(once.tombstones);
  });

  it('a first sync against an empty cloud yields the local data verbatim', () => {
    const merged = reconcile(local, emptyRemote);
    expect(merged.collections.checkIns!.map((r) => r.id)).toEqual(['a']);
  });

  it('a deletion on one device is not resurrected by the other', () => {
    const withTombstone: LocalSnapshot = {
      collections: { checkIns: [] },
      singletons: {},
      tombstones: [{ collection: 'checkIns', recordId: 'a', deletedAt: '2026-03-01T00:00:00Z' }],
    };
    // Remote still has the old 'a'; the tombstone must suppress it.
    const merged = reconcile(withTombstone, remote);
    expect(merged.collections.checkIns!.find((r) => r.id === 'a')).toBeUndefined();
  });
});
