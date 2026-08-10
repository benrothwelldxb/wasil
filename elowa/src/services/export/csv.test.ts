import { describe, it, expect } from 'vitest';
import { checkInsToCsv } from './csv';
import { makeCheckIn } from '@/test/factories';

describe('checkInsToCsv', () => {
  it('emits a header and one row per observation (and normal days)', () => {
    const csv = checkInsToCsv([
      makeCheckIn('2026-01-01', { normal: true, tags: ['ctx_alcohol'] }),
      makeCheckIn('2026-01-02', { obs: [{ id: 'sym_sleep', status: 'much_worse' }, { id: 'sym_mood', status: 'a_little_worse' }] }),
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('date,kind,felt_normal');
    // 1 normal row + 2 observation rows.
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('2026-01-01');
    expect(lines[2]).toContain('sym_sleep');
  });

  it('escapes commas and quotes in notes', () => {
    const csv = checkInsToCsv([makeCheckIn('2026-01-01', { normal: true, note: 'rough, "hard" night' })]);
    expect(csv).toContain('"rough, ""hard"" night"');
  });
});
