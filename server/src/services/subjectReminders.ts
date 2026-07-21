// Per-school subject→reminder map helpers (see `timetableReminders.ts` for the
// resolver that consumes the rows, and the `SubjectReminder` model).

import prisma from './prisma.js'
import { DEFAULT_SUBJECT_REMINDERS, subjectKeyOf } from './timetableReminders.js'

/**
 * Seed a school's reminder map with the defaults, but ONLY if it has none yet.
 * Idempotent: a school that already has rows (including admin edits) is left
 * untouched, and the createMany `skipDuplicates` guards the unique key even
 * under a race. Safe to call on every admin GET of the map.
 */
export async function ensureDefaultSubjectReminders(schoolId: string): Promise<void> {
  const existing = await prisma.subjectReminder.count({ where: { schoolId } })
  if (existing > 0) return
  await prisma.subjectReminder.createMany({
    data: DEFAULT_SUBJECT_REMINDERS.map((d) => ({
      schoolId,
      subject: d.subject,
      subjectKey: subjectKeyOf(d.subject),
      emoji: d.emoji,
      reminder: d.reminder,
    })),
    skipDuplicates: true,
  })
}
