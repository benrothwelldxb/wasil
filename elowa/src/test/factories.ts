import type { DailyCheckIn, RelativeStatus, Severity } from '@/domain/models';
import { addDays, type IsoDate } from '@/lib/date';

export interface ObsInput {
  id: string;
  status?: RelativeStatus;
  severity?: Severity;
}

/** Build a check-in tersely for tests. */
export function makeCheckIn(
  date: IsoDate,
  opts: { normal?: boolean; obs?: ObsInput[]; tags?: string[]; note?: string } = {},
): DailyCheckIn {
  const normal = opts.normal ?? (opts.obs ?? []).length === 0;
  return {
    id: `ci_${date}`,
    date,
    kind: normal ? 'normal' : 'detailed',
    feltNormal: normal,
    observations: (opts.obs ?? []).map((o) => ({
      symptomId: o.id,
      ...(o.status ? { status: o.status } : {}),
      ...(o.severity ? { severity: o.severity } : {}),
    })),
    contextTagIds: opts.tags ?? [],
    ...(opts.note ? { note: opts.note } : {}),
    createdAt: `${date}T20:00:00.000Z`,
    updatedAt: `${date}T20:00:00.000Z`,
  };
}

/** Generate a run of consecutive-day check-ins from a start date. */
export function makeRun(
  start: IsoDate,
  count: number,
  fn: (i: number) => { normal?: boolean; obs?: ObsInput[]; tags?: string[] },
): DailyCheckIn[] {
  return Array.from({ length: count }, (_, i) => makeCheckIn(addDays(start, i), fn(i)));
}
