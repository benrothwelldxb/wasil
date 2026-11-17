/** YYYY-MM-DD plus n days. Calendar arithmetic only: the date is the school's,
 *  so no timezone is applied. */
export function addDaysISO(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
