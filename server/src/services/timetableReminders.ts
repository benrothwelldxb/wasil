// "Today your child has Swimming — bring kit" reminder mapping.
//
// Given a timetable block, decide whether it's worth nudging the parent about
// and, if so, what to bring. Most blocks (Maths, English, a break) are *not*
// reminder-worthy and are dropped. The reminder-worthy ones are a small,
// table-driven set keyed by subject name — add a row to extend it.
//
// Matching is by case-insensitive subject *name* (Hub sends the block's
// `specialist` flag too — Swimming/PE are specialist — but the flag is carried
// through onto the item for the UI rather than used to gate the match, so a
// non-specialist reminder like Library works the same way).

import type { HubTimetableBlock } from './hubMis.js'

export interface ReminderItem {
  /** The subject as Hub named it, e.g. "Swimming" (original casing preserved). */
  subject: string
  /** Hub's specialist flag — true for Swimming/PE. Surfaced for the UI. */
  specialist: boolean
  /** A single emoji for the item. */
  emoji: string
  /** Short parent-facing nudge, e.g. "Bring swimming kit". */
  reminder: string
}

interface ReminderRule {
  emoji: string
  reminder: string
}

// The map. Keys are lower-cased subject names. Aliases (PE / P.E. / Physical
// Education) point at the same rule. Extend by adding rows.
const REMINDERS: Record<string, ReminderRule> = {
  swimming: { emoji: '🩱', reminder: 'Bring swimming kit' },
  pe: { emoji: '👟', reminder: 'Bring PE kit' },
  'p.e.': { emoji: '👟', reminder: 'Bring PE kit' },
  'physical education': { emoji: '👟', reminder: 'Bring PE kit' },
  games: { emoji: '👟', reminder: 'Bring PE kit' },
  library: { emoji: '📚', reminder: 'Bring library books' },
}

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Map a block to a reminder item, or `null` if it isn't reminder-worthy.
 * Only the block's `subject.name` and `specialist` flag are consulted, so this
 * works against Hub's DTO and any local subset of it.
 */
export function reminderForBlock(
  block: Pick<HubTimetableBlock, 'subject' | 'specialist'>,
): ReminderItem | null {
  const name = block.subject?.name
  if (!name) return null
  const rule = REMINDERS[normalise(name)]
  if (!rule) return null
  return {
    subject: name,
    specialist: block.specialist,
    emoji: rule.emoji,
    reminder: rule.reminder,
  }
}

/** Map a day's blocks to its reminder items, preserving order and dropping
 * non-reminder-worthy blocks. */
export function remindersForBlocks(
  blocks: ReadonlyArray<Pick<HubTimetableBlock, 'subject' | 'specialist'>>,
): ReminderItem[] {
  const items: ReminderItem[] = []
  for (const b of blocks) {
    const item = reminderForBlock(b)
    if (item) items.push(item)
  }
  return items
}
