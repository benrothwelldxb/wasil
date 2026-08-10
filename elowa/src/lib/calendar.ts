import { toIsoDate, type IsoDate } from './date';

export interface MonthCell {
  date: IsoDate;
  dayNumber: number;
  inMonth: boolean;
}

/**
 * Build a 6-row (42 cell) month grid starting on Monday, including trailing/
 * leading days from adjacent months so the grid is always rectangular.
 */
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const first = new Date(year, month, 1);
  // JS: 0=Sun..6=Sat. We want Monday-first, so shift.
  const firstWeekday = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekday);

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      date: toIsoDate(d),
      dayNumber: d.getDate(),
      inMonth: d.getMonth() === month,
    });
  }
  return cells;
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}
