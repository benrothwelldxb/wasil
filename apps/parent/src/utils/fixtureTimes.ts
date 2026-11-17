import type { ThisWeekItem } from '@wasil/shared'

/**
 * The time lines on a This Week card.
 *
 * A fixture's afternoon has up to four times and a parent plans against all
 * of them: when the child leaves, when the match starts, and either when they
 * are back at school or when to collect them from the venue. Kick-off used to
 * be dropped whenever there was a leave time, so a parent saw "Leaves 07:53"
 * and never learnt the race was at 08:38.
 *
 * Times are printed exactly as Active sent them: wall clock at the school,
 * never parsed or converted.
 */
export function fixtureTimeLines(item: ThisWeekItem): string[] {
  if (item.kind !== 'fixture') {
    return [`${item.starts_at}${item.ends_at ? `–${item.ends_at}` : ''}`]
  }
  const parts: string[] = []
  // Meet comes first: it is the time the child has to be somewhere.
  if (item.meet_at) parts.push(`Meet ${item.meet_at}`)
  if (item.departs_at) parts.push(`${parts.length ? 'leaves' : 'Leaves'} ${item.departs_at}`)
  if (item.starts_at) parts.push(`${parts.length ? 'starts' : 'Starts'} ${item.starts_at}`)
  // Collecting from the venue replaces coming back to school; never both.
  if (item.returns_at && !item.collect_at) parts.push(`back at school ${item.returns_at}`)
  const lines = parts.length ? [parts.join(' · ')] : []
  if (item.collect_at) lines.push(`Collect from the venue at ${item.collect_at}`)
  return lines
}

/**
 * The rest of what a parent needs for a fixture, as label/value rows, in the
 * order they are acted on: are they playing, what to pack, how they get there.
 * The note for families is separate, shown in full below these.
 * Only what Active sent; nothing is shown for a field that is not set.
 */
export function fixtureDetailRows(item: ThisWeekItem): Array<{ label: string; value: string }> {
  if (item.kind !== 'fixture') return []
  const rows: Array<{ label: string; value: string }> = []
  if (item.role === 'playing') rows.push({ label: 'Squad', value: 'Playing' })
  else if (item.role === 'substitute') rows.push({ label: 'Squad', value: 'Substitute' })
  if (item.kit) rows.push({ label: 'Kit', value: item.kit })
  if (item.transport) rows.push({ label: 'Transport', value: item.transport })
  return rows
}
