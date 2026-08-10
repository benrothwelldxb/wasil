/**
 * Sync service (Phase 3) — wires the pure sync engine to the repositories.
 *
 * Offline-first: local repositories are always the working copy. `sync()` pulls
 * the remote snapshot, reconciles (id-union + LWW + tombstones), writes the
 * merged result back locally, and pushes it up. Migration of a guest's existing
 * history to a new account is just the first `sync()` — it preserves local data
 * and is idempotent.
 */
import type { Tombstone } from '@/domain/models';
import type { RemoteBackend } from './remoteBackend';
import { reconcile, toRemoteSnapshot, type LocalSnapshot } from './syncEngine';
import {
  accountRepository,
  appointmentRepository,
  checkInRepository,
  cycleRepository,
  insightFeedbackRepository,
  preferencesRepository,
  privacyRepository,
  symptomRepository,
  treatmentRepository,
} from '@/services/repositories';

export function buildLocalSnapshot(): LocalSnapshot {
  return {
    collections: {
      checkIns: checkInRepository.list(),
      periods: cycleRepository.listPeriods(),
      treatments: treatmentRepository.list(),
      appointments: appointmentRepository.list(),
    },
    singletons: {
      preferences: preferencesRepository.getPreferences(),
      tracking: symptomRepository.getConfig(),
      privacy: privacyRepository.getAll(),
      feedback: insightFeedbackRepository.getAll(),
    },
    tombstones: accountRepository.getTombstones(),
  };
}

export function applySnapshot(snapshot: LocalSnapshot): void {
  const c = snapshot.collections;
  if (c.checkIns) checkInRepository.replaceAll(c.checkIns as never[]);
  if (c.periods) cycleRepository.replaceAll(c.periods as never[]);
  if (c.treatments) treatmentRepository.replaceAll(c.treatments as never[]);
  if (c.appointments) appointmentRepository.replaceAll(c.appointments as never[]);
  const s = snapshot.singletons;
  if (s.preferences) preferencesRepository.setPreferences(s.preferences as never);
  if (s.tracking) symptomRepository.setConfig(s.tracking as never);
  if (s.privacy) privacyRepository.setAll(s.privacy as never);
  if (s.feedback) insightFeedbackRepository.setAll(s.feedback as never);
  accountRepository.setTombstones(snapshot.tombstones);
}

/** Record a deletion as a tombstone so it doesn't reappear from another device. */
export function recordDeletion(collection: string, recordId: string, now: string): void {
  const t: Tombstone = { collection, recordId, deletedAt: now };
  accountRepository.addTombstone(t);
}

export interface SyncResult {
  status: 'synced' | 'needs_attention';
  revision: number;
}

/** Reconcile local ↔ remote for an account. Idempotent. */
export async function sync(backend: RemoteBackend, accountId: string): Promise<SyncResult> {
  if (!backend.isConnected()) return { status: 'needs_attention', revision: 0 };
  const remote = (await backend.pull(accountId)) ?? { collections: {}, singletons: {}, tombstones: [], revision: 0 };
  const merged = reconcile(buildLocalSnapshot(), remote);
  applySnapshot(merged);
  const { revision } = await backend.push(accountId, toRemoteSnapshot(merged, remote.revision));
  return { status: 'synced', revision };
}

/** Migrate a guest's local history to a freshly-created account (first sync). */
export async function migrateToAccount(backend: RemoteBackend, accountId: string): Promise<SyncResult> {
  return sync(backend, accountId);
}
