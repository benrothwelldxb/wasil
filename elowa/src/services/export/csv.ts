/**
 * CSV export of tracking data (Phase 2). Produces a flat, self-describing table
 * that remains understandable without the app.
 */
import type { DailyCheckIn } from '@/domain/models';

function escapeCsv(value: string | number | boolean | undefined): string {
  const s = value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  'date',
  'kind',
  'felt_normal',
  'symptom_id',
  'status',
  'severity',
  'context_tags',
  'note',
] as const;

export function checkInsToCsv(checkIns: readonly DailyCheckIn[]): string {
  const rows: string[] = [HEADERS.join(',')];
  const sorted = [...checkIns].sort((a, b) => a.date.localeCompare(b.date));
  for (const c of sorted) {
    const tags = c.contextTagIds.join('|');
    if (c.observations.length === 0) {
      rows.push([c.date, c.kind, c.feltNormal, '', '', '', tags, c.note ?? ''].map(escapeCsv).join(','));
    } else {
      for (const o of c.observations) {
        rows.push(
          [c.date, c.kind, c.feltNormal, o.symptomId, o.status ?? '', o.severity ?? '', tags, c.note ?? '']
            .map(escapeCsv)
            .join(','),
        );
      }
    }
  }
  return rows.join('\n');
}

export function downloadCsv(checkIns: readonly DailyCheckIn[], now: string): void {
  const blob = new Blob([checkInsToCsv(checkIns)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `elowa-tracking-${now.slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
