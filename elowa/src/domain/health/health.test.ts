import { describe, it, expect, beforeEach } from 'vitest';
import { MockHealthProvider, UnsupportedHealthProvider } from './providers';
import { healthRepository } from '@/services/repositories/healthRepository';
import { clearMode, setDataMode } from '@/services/storage/dataContext';

beforeEach(() => {
  setDataMode('real');
  clearMode('real');
});

describe('UnsupportedHealthProvider', () => {
  it('never claims data is connected', async () => {
    const p = new UnsupportedHealthProvider();
    expect(p.capabilities().connectable).toBe(false);
    const res = await p.getDailySamples();
    expect(res.status).toBe('unsupported');
  });
});

describe('MockHealthProvider', () => {
  it('reports permission_denied before consent', async () => {
    const p = new MockHealthProvider();
    const res = await p.getDailySamples('2026-01-01', '2026-01-10');
    expect(res.status).toBe('permission_denied');
  });

  it('reports no_data when granted but empty', async () => {
    const p = new MockHealthProvider();
    await p.requestPermissions(['sleep_duration']);
    const res = await p.getDailySamples('2026-01-01', '2026-01-10');
    expect(res.status).toBe('no_data');
  });

  it('returns valid data when granted and samples exist', async () => {
    const p = new MockHealthProvider();
    await p.requestPermissions(['sleep_duration']);
    healthRepository.upsertSamples(
      Array.from({ length: 10 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, sleepMinutes: 420 })),
    );
    const res = await p.getDailySamples('2026-01-01', '2026-01-10');
    expect(res.status).toBe('valid');
    expect(res.value?.length).toBe(10);
  });

  it('reports partial_data when coverage is sparse', async () => {
    const p = new MockHealthProvider();
    await p.requestPermissions(['sleep_duration']);
    healthRepository.upsertSamples([{ date: '2026-01-01', sleepMinutes: 420 }]);
    const res = await p.getDailySamples('2026-01-01', '2026-01-10');
    expect(res.status).toBe('partial_data');
  });
});
