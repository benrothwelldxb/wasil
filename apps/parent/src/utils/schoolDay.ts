/** A date label from a YYYY-MM-DD string, built from its own parts.
 *
 *  Deliberately NOT `new Date(dateStr)` then toLocaleDateString: that parses as
 *  UTC midnight and renders in the device's zone, so a parent west of the
 *  school sees every day shifted back by one. The string names a day at the
 *  school; only its parts are used. */
export function dayLabel(dateStr: string): { weekday: string; day: string; isWeekend: boolean } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d))
  const dow = at.getUTCDay() // 0 = Sunday, 6 = Saturday
  return {
    weekday: at.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }),
    day: at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    // Saturday and Sunday. True for the UAE school week and for most of the
    // schools Connect serves; a school whose week runs Sunday–Thursday would
    // need this from its own calendar rather than from the day number, and
    // there is nothing on the wire that says so today.
    isWeekend: dow === 0 || dow === 6,
  }
}
