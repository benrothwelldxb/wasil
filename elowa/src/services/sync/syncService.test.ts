import { describe, it, expect, beforeEach } from 'vitest';
import { clearMode, setDataMode } from '../storage/dataContext';
import { checkInRepository, appointmentRepository, accountRepository } from '../repositories';
import { sync, migrateToAccount, recordDeletion, buildLocalSnapshot } from './syncService';
import { LocalMockBackend } from './remoteBackend';
import { makeCheckIn } from '@/test/factories';
import type { AppointmentRecord } from '@/domain/models';

const ACCOUNT = 'acct_test';
let backend: LocalMockBackend;

const appt = (id: string, updatedAt: string): AppointmentRecord => ({
  id,
  date: '2026-01-10',
  questions: [],
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt,
});

beforeEach(async () => {
  setDataMode('real');
  clearMode('real');
  backend = new LocalMockBackend();
  await backend.purge(ACCOUNT);
});

describe('migration & sync (repository-wired)', () => {
  it('migrates a guest’s existing history to a new account without losing it', async () => {
    checkInRepository.upsert(makeCheckIn('2026-01-01', { normal: true }));
    checkInRepository.upsert(makeCheckIn('2026-01-02', { normal: true }));

    await migrateToAccount(backend, ACCOUNT);

    // Local data is preserved…
    expect(checkInRepository.list()).toHaveLength(2);
    // …and the cloud now holds it.
    const remote = await backend.pull(ACCOUNT);
    expect(remote?.collections.checkIns).toHaveLength(2);
  });

  it('is idempotent — syncing repeatedly never duplicates records', async () => {
    checkInRepository.upsert(makeCheckIn('2026-01-01', { normal: true }));
    await sync(backend, ACCOUNT);
    await sync(backend, ACCOUNT);
    await sync(backend, ACCOUNT);
    expect(checkInRepository.list()).toHaveLength(1);
    const remote = await backend.pull(ACCOUNT);
    expect(remote?.collections.checkIns).toHaveLength(1);
  });

  it('pulls records created on another device into this one', async () => {
    // This device starts empty and syncs once (registers with cloud).
    await sync(backend, ACCOUNT);
    // Simulate a second device pushing an appointment straight to the cloud.
    const remote = (await backend.pull(ACCOUNT))!;
    await backend.push(ACCOUNT, {
      ...remote,
      collections: { ...remote.collections, appointments: [appt('a_other', '2026-02-01T00:00:00Z')] },
    });
    // Next sync brings it down.
    await sync(backend, ACCOUNT);
    expect(appointmentRepository.get('a_other')).not.toBeNull();
  });

  it('a deletion on this device is not resurrected by the cloud copy', async () => {
    appointmentRepository.upsert(appt('a1', '2026-01-10T00:00:00Z'));
    await sync(backend, ACCOUNT); // cloud now has a1

    // Delete locally and record the tombstone (as the service does).
    appointmentRepository.remove('a1');
    recordDeletion('appointments', 'a1', '2026-03-01T00:00:00Z');

    await sync(backend, ACCOUNT);
    expect(appointmentRepository.get('a1')).toBeNull();
    const remote = await backend.pull(ACCOUNT);
    expect((remote?.collections.appointments ?? []).length).toBe(0);
  });

  it('keeps the newer edit when the same record changed on two devices', async () => {
    appointmentRepository.upsert(appt('a1', '2026-01-10T00:00:00Z'));
    await sync(backend, ACCOUNT);

    // Cloud gets a newer edit of a1 (from "another device").
    const remote = (await backend.pull(ACCOUNT))!;
    await backend.push(ACCOUNT, {
      ...remote,
      collections: { appointments: [{ ...appt('a1', '2026-05-01T00:00:00Z'), reason: 'newer' }] },
    });

    await sync(backend, ACCOUNT);
    expect(appointmentRepository.get('a1')?.reason).toBe('newer');
  });

  it('buildLocalSnapshot carries tombstones so deletions propagate', () => {
    recordDeletion('checkIns', 'ci_x', '2026-03-01T00:00:00Z');
    const snap = buildLocalSnapshot();
    expect(snap.tombstones.some((t) => t.recordId === 'ci_x')).toBe(true);
    accountRepository.setTombstones([]);
  });
});
