import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkInRepository,
  cycleRepository,
  preferencesRepository,
  treatmentRepository,
} from './repositories';
import { clearMode, getDataMode, setDataMode } from './storage/dataContext';
import { buildExportBundle, deleteAllData } from './dataManagement';
import { enterDemoMode, exitDemoMode } from './demo';
import { makeCheckIn } from '@/test/factories';

beforeEach(() => {
  setDataMode('real');
  clearMode('real');
  clearMode('demo');
});

describe('checkInRepository', () => {
  it('persists, lists (sorted) and reads by date', () => {
    checkInRepository.upsert(makeCheckIn('2026-01-02', { normal: true }));
    checkInRepository.upsert(makeCheckIn('2026-01-01', { normal: true }));
    const list = checkInRepository.list();
    expect(list.map((c) => c.date)).toEqual(['2026-01-01', '2026-01-02']);
    expect(checkInRepository.getByDate('2026-01-01')).not.toBeNull();
  });

  it('upsert replaces a same-date entry', () => {
    checkInRepository.upsert(makeCheckIn('2026-01-01', { normal: true }));
    checkInRepository.upsert(makeCheckIn('2026-01-01', { obs: [{ id: 'sym_sleep', status: 'much_worse' }] }));
    const list = checkInRepository.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.feltNormal).toBe(false);
  });

  it('removes by date', () => {
    checkInRepository.upsert(makeCheckIn('2026-01-01', { normal: true }));
    checkInRepository.removeByDate('2026-01-01');
    expect(checkInRepository.list()).toHaveLength(0);
  });
});

describe('export & delete', () => {
  it('exports a versioned bundle of all data', () => {
    checkInRepository.upsert(makeCheckIn('2026-01-01', { normal: true }));
    cycleRepository.upsertPeriod({ id: 'p1', date: '2026-01-01', flow: 'medium' });
    treatmentRepository.upsert({ id: 't1', category: 'hrt', title: 'HRT', date: '2026-01-01' });
    preferencesRepository.setQuestions(['Is my dose right?']);

    const bundle = buildExportBundle('2026-02-01T00:00:00.000Z');
    expect(bundle.app).toBe('elowa');
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.data.checkIns).toHaveLength(1);
    expect(bundle.data.periods).toHaveLength(1);
    expect(bundle.data.treatments).toHaveLength(1);
    expect(bundle.data.appointmentQuestions).toEqual(['Is my dose right?']);
  });

  it('deletes all data for the active context', () => {
    checkInRepository.upsert(makeCheckIn('2026-01-01', { normal: true }));
    deleteAllData();
    expect(checkInRepository.list()).toHaveLength(0);
  });
});

describe('demo isolation', () => {
  it('never mixes demo data with real data', () => {
    checkInRepository.upsert(makeCheckIn('2026-01-01', { normal: true }));
    expect(checkInRepository.list()).toHaveLength(1);

    enterDemoMode('2026-06-01');
    expect(getDataMode()).toBe('demo');
    expect(checkInRepository.list().length).toBeGreaterThan(1); // demo dataset

    exitDemoMode();
    expect(getDataMode()).toBe('real');
    // Real data is untouched by the demo session.
    expect(checkInRepository.list()).toHaveLength(1);
  });
});
