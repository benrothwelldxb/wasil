// "Today your child has Swimming — remember swimwear" reminder mapping.
//
// Given a timetable block, decide whether it's worth nudging the parent about
// and, if so, what to bring. Most blocks (Maths, English, a break) are *not*
// reminder-worthy and are dropped. The reminder-worthy ones come from a
// per-school, admin-editable map (the `SubjectReminder` table), matched by
// case-insensitive subject *name*. Unmapped subjects produce no reminder.
//
// Hub sends the block's `specialist` flag too (Swimming/PE are specialist) — the
// flag is carried through onto the item for the UI rather than used to gate the
// match, so a non-specialist reminder like Library works the same way.

import type { HubTimetableBlock } from './hubMis.js'

export interface ReminderItem {
  /** The subject as Hub named it, e.g. "Swimming" (original casing preserved). */
  subject: string
  /** Hub's specialist flag — true for Swimming/PE. Surfaced for the UI. */
  specialist: boolean
  /** A single emoji for the item. */
  emoji: string
  /** Short parent-facing nudge, e.g. "Remember swimwear, towel & goggles". */
  reminder: string
}

/** A row of the editable map — the subset the resolver needs. */
export interface SubjectReminderRow {
  subject: string
  emoji: string
  reminder: string
  /** Inactive rows are ignored by the resolver (defaults to active). */
  active?: boolean
}

// The out-of-the-box wording, mirroring the admin "Schedule & Reminders" page's
// existing recurring-type wording. Used to seed a school's map (see
// `ensureDefaultSubjectReminders`) so reminders work before any admin edit.
export const DEFAULT_SUBJECT_REMINDERS: ReadonlyArray<{
  subject: string
  emoji: string
  reminder: string
}> = [
  { subject: 'Swimming', emoji: '🏊', reminder: 'Remember swimwear, towel & goggles' },
  { subject: 'PE', emoji: '🏃', reminder: 'Please wear PE kit' },
  { subject: 'Library', emoji: '📚', reminder: 'Return library books' },
  { subject: 'Music', emoji: '🎵', reminder: 'Bring instrument' },
]

/** The match key for a subject name — the same normalisation the DB's
 * `subjectKey` column stores. Case-insensitive, whitespace-collapsed. */
export function subjectKeyOf(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface ReminderResolver {
  reminderForBlock(block: Pick<HubTimetableBlock, 'subject' | 'specialist'>): ReminderItem | null
  remindersForBlocks(
    blocks: ReadonlyArray<Pick<HubTimetableBlock, 'subject' | 'specialist'>>,
  ): ReminderItem[]
}

/**
 * Build a resolver from a school's reminder rows. Rows are keyed by normalised
 * subject name; inactive rows are skipped. A block matches when its
 * `subject.name` normalises to a live row's key.
 */
export function buildReminderResolver(rows: ReadonlyArray<SubjectReminderRow>): ReminderResolver {
  const byKey = new Map<string, { emoji: string; reminder: string }>()
  for (const r of rows) {
    if (r.active === false) continue
    byKey.set(subjectKeyOf(r.subject), { emoji: r.emoji, reminder: r.reminder })
  }

  function reminderForBlock(
    block: Pick<HubTimetableBlock, 'subject' | 'specialist'>,
  ): ReminderItem | null {
    const name = block.subject?.name
    if (!name) return null
    const rule = byKey.get(subjectKeyOf(name))
    if (!rule) return null
    return {
      subject: name,
      specialist: block.specialist,
      emoji: rule.emoji,
      reminder: rule.reminder,
    }
  }

  function remindersForBlocks(
    blocks: ReadonlyArray<Pick<HubTimetableBlock, 'subject' | 'specialist'>>,
  ): ReminderItem[] {
    const items: ReminderItem[] = []
    for (const b of blocks) {
      const item = reminderForBlock(b)
      if (item) items.push(item)
    }
    return items
  }

  return { reminderForBlock, remindersForBlocks }
}
