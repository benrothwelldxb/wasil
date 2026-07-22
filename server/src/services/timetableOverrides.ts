// This-week timetable overrides — the apply layer.
//
// A Connect-owned exception layer over the Hub-sourced timetable. Given the
// reminder items Hub resolved for one (class, date) and that (class, date)'s
// override rows, produce the *net* result staff/parents should see:
//   • drop any item whose subject matches a CANCELLED row;
//   • append an item for each ADDED row, resolving its emoji + reminder text
//     from the school's SubjectReminder map (row.emoji wins if set).
// Matching is case-insensitive via `subjectKeyOf`, the same normalisation the
// `subjectKey` column stores.
//
// `applyOverrides` returns the net ReminderItem list (used by GET /today, where
// parents must not see a cancelled subject). `applyOverridesToGrid` keeps the
// cancelled subject but flags it (and flags the added ones) so the read-only
// admin grid can render both distinctly.

import { subjectKeyOf, type ReminderItem, type ReminderResolver } from './timetableReminders.js'

/** Emoji used for an ADDED override when neither the row nor the map has one. */
export const DEFAULT_OVERRIDE_EMOJI = '📌'

/** The subset of a TimetableOverride row the apply layer needs. The Prisma
 * `TimetableOverride` type is structurally assignable to this. */
export interface OverrideInput {
  subjectKey: string
  subject: string
  emoji: string | null
  action: string // 'CANCELLED' | 'ADDED'
}

const isCancelled = (o: OverrideInput) => o.action === 'CANCELLED'
const isAdded = (o: OverrideInput) => o.action === 'ADDED'

/** Resolve an ADDED override row into a ReminderItem, drawing emoji + reminder
 * text from the school's map (via the resolver) and falling back sensibly. */
function addedItem(o: OverrideInput, resolver: ReminderResolver): ReminderItem {
  const mapped = resolver.reminderForBlock({
    subject: { id: '', name: o.subject, color: null, isStatutory: false },
    specialist: false,
  })
  return {
    subject: o.subject,
    specialist: false,
    emoji: o.emoji ?? mapped?.emoji ?? DEFAULT_OVERRIDE_EMOJI,
    reminder: mapped?.reminder ?? `Don't forget ${o.subject}`,
  }
}

/**
 * Net reminder items for one (class, date): CANCELLED subjects removed, ADDED
 * subjects appended. Order is stable (surviving Hub items first, in their
 * original order, then added items in override order).
 */
export function applyOverrides(
  items: ReminderItem[],
  overrides: OverrideInput[],
  resolver: ReminderResolver,
): ReminderItem[] {
  if (overrides.length === 0) return items
  const cancelledKeys = new Set(overrides.filter(isCancelled).map((o) => o.subjectKey))
  const kept = items.filter((i) => !cancelledKeys.has(subjectKeyOf(i.subject)))
  const added = overrides.filter(isAdded).map((o) => addedItem(o, resolver))
  return [...kept, ...added]
}

/** A grid subject annotated with its override state for the read-only admin view. */
export interface GridSubjectOverride {
  subject: string
  emoji: string
  specialist: boolean
  /** This Hub-allocated subject is cancelled this week. */
  cancelled?: boolean
  /** This subject was added this week via an override (not from Hub). */
  added?: boolean
}

/** Base grid subject shape (from the Hub allocation). */
export interface GridSubjectBase {
  subject: string
  emoji: string
  specialist: boolean
}

/**
 * Grid variant: keep the Hub subjects but flag cancelled ones, and append the
 * added ones (flagged), so the UI can strike through cancellations and badge
 * additions. Order is stable (Hub subjects first, then added).
 */
export function applyOverridesToGrid(
  subjects: GridSubjectBase[],
  overrides: OverrideInput[],
  resolver: ReminderResolver,
): GridSubjectOverride[] {
  if (overrides.length === 0) return subjects.map((s) => ({ ...s }))
  const cancelledKeys = new Set(overrides.filter(isCancelled).map((o) => o.subjectKey))
  const out: GridSubjectOverride[] = subjects.map((s) =>
    cancelledKeys.has(subjectKeyOf(s.subject)) ? { ...s, cancelled: true } : { ...s },
  )
  for (const o of overrides.filter(isAdded)) {
    const item = addedItem(o, resolver)
    out.push({ subject: item.subject, emoji: item.emoji, specialist: item.specialist, added: true })
  }
  return out
}
