import prisma from './prisma.js'

/**
 * "Update to families" messages Active has sent about a child's fixture.
 *
 * Active sends each one as a communication intent (`fixture.update`), and
 * Connect already keeps every intent it delivers (PartnerIntent). Until now the
 * message lived only in the push and the notification list, so a parent who
 * swiped it away had to go looking for it on match day. These are what the home
 * page and This Week show beside the fixture, from when the update arrives until
 * the fixture's day is over.
 *
 * Read from Connect's own record, not Active's: this is what the parent was
 * told, so it is what they should see again.
 */
export interface FixtureUpdate {
  studentId: string
  fixtureId: string
  fixtureName: string | null
  /** YYYY-MM-DD, the fixture's day at the school. */
  date: string | null
  /** The teacher's words, verbatim. */
  message: string
  sentAt: string
}

/** How far back to look. An update is about a fixture in the near future; a
 *  bound keeps this an index read rather than a scan of every intent. */
const LOOKBACK_DAYS = 60

/**
 * Updates for these children about fixtures on or after `fromDate` (and on or
 * before `toDate`, when given), newest first. Dates are the school's
 * YYYY-MM-DD, so string comparison is date comparison.
 */
export async function fixtureUpdatesFor(
  studentIds: string[],
  fromDate: string,
  toDate?: string,
): Promise<FixtureUpdate[]> {
  if (studentIds.length === 0) return []
  const rows = await prisma.partnerIntent.findMany({
    where: {
      eventType: 'fixture.update',
      status: 'DELIVERED',
      studentId: { in: studentIds },
      createdAt: { gte: new Date(Date.now() - LOOKBACK_DAYS * 86400000) },
    },
    select: { studentId: true, payload: true, occurredAt: true },
    orderBy: { occurredAt: 'desc' },
  })

  const out: FixtureUpdate[] = []
  for (const r of rows) {
    const p = (r.payload ?? {}) as Record<string, unknown>
    const str = (k: string) => (typeof p[k] === 'string' && (p[k] as string).trim() ? (p[k] as string).trim() : null)
    const fixtureId = str('fixtureId')
    const message = str('message')
    const date = str('date')?.slice(0, 10) ?? null
    if (!r.studentId || !fixtureId || !message) continue
    // An update with no date cannot be placed against a day. It is kept for
    // two days after sending rather than dropped (losing a message is the
    // worse failure) but not left on the home page indefinitely.
    if (!date && r.occurredAt.getTime() < Date.now() - 2 * 86400000) continue
    if (date && date < fromDate) continue
    if (date && toDate && date > toDate) continue
    out.push({
      studentId: r.studentId,
      fixtureId,
      fixtureName: str('fixtureName'),
      date,
      message,
      sentAt: r.occurredAt.toISOString(),
    })
  }
  return out
}

/** YYYY-MM-DD plus n days. Pure calendar arithmetic, no timezone involved. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** From this time the day before (school wall clock), tomorrow's fixtures show
 *  on the home page: the afternoon parents pack kit and plan pick-up. */
export const DAY_BEFORE_FROM = '15:00'
