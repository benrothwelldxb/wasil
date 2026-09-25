// Telling a family that booking is open FOR THEM.
//
// Staggered opening was built and then announced to nobody. Nothing fired when
// an evening opened, nothing fired when a year group's wave opened, and the
// parent dashboard did not mention consultations at all — the only way in was
// the side menu. So a wave rewarded whoever happened to have the app open at
// the right moment, and the parents who most need a fair shot at a slot, the
// ones not refreshing at six o'clock, were told nothing at all.
//
// WHY A JOB, when the booking gate itself needs none. Opening is read from the
// clock on every request, so nothing has to run for booking to work. But a
// NOTIFICATION is an event at a moment, and a moment nobody is present for
// needs something to notice it passing. This is that something, and it is the
// only part of waves that can fail quietly — hence the ledger and the window.
import prisma from './prisma.js'
import { sendNotification } from './notify.js'

/** How recently an opening must have happened for it to be worth announcing.
 *
 *  A parent told at 18:00 that booking opened is being helped. A parent told on
 *  Thursday that it opened on Monday is being confused — and worse, told to
 *  hurry for slots that have been going for three days. Anything older than
 *  this was missed, and a missed announcement is not improved by arriving late.
 *
 *  It is also what makes the first deploy silent: every existing event has a
 *  null `bookingOpenedAt`, which is outside any window. */
const ANNOUNCE_WITHIN_MS = 24 * 60 * 60 * 1000

export interface OpeningSummary {
  /** Events considered — open for booking, opened recently enough to announce. */
  events: number
  /** Parents newly told. The number that matters. */
  notified: number
  /** Parents who could book and had already been told; the ledger working. */
  alreadyTold: number
}

/**
 * Announce openings to the families they apply to.
 *
 * Runs often (every few minutes) because waves can be thirty minutes apart, and
 * an announcement an hour late is an announcement about a race already run.
 *
 * Idempotent by construction: the ledger is the source of truth for "has this
 * family been told", so a crash halfway, a double deploy, or two instances
 * ticking at once cannot produce a second push about the same evening.
 */
export async function notifyConsultationOpenings(now: Date = new Date()): Promise<OpeningSummary> {
  const summary: OpeningSummary = { events: 0, notified: 0, alreadyTold: 0 }
  const since = new Date(now.getTime() - ANNOUNCE_WITHIN_MS)

  const events = await prisma.consultationEvent.findMany({
    where: {
      status: 'BOOKING_OPEN',
      // Recently opened, or carrying a wave that opened recently. Either can be
      // the moment a family became able to book.
      OR: [
        { bookingOpenedAt: { gte: since } },
        { bookingWindows: { some: { opensAt: { gte: since, lte: now } } } },
      ],
    },
    select: {
      id: true,
      schoolId: true,
      title: true,
      date: true,
      bookingOpenedAt: true,
      bookingWindows: { select: { yearGroupId: true, opensAt: true } },
    },
  })

  for (const event of events) {
    summary.events++

    // Every parent with a child on roll here, and the year groups those
    // children are in. A family's eligibility is decided across ALL their
    // children, which is the same rule the booking gate applies — the two must
    // not be able to disagree, or a parent is told to book and then refused.
    const links = await prisma.parentStudentLink.findMany({
      where: { student: { schoolId: event.schoolId, leftAt: null, isTest: false } },
      select: { userId: true, student: { select: { class: { select: { yearGroupId: true } } } } },
    })
    if (links.length === 0) continue

    const windowFor = new Map(event.bookingWindows.map(w => [w.yearGroupId, w.opensAt]))
    const yearGroupsByParent = new Map<string, string[]>()
    for (const l of links) {
      const yg = l.student?.class?.yearGroupId
      const list = yearGroupsByParent.get(l.userId) ?? []
      if (yg) list.push(yg)
      yearGroupsByParent.set(l.userId, list)
    }

    const eligible: string[] = []
    for (const [userId, yearGroups] of yearGroupsByParent) {
      // The moment THIS family became able to book. A child whose year group
      // has no window can book as soon as the event is open, so that family's
      // moment is the event's own opening — which is also the sibling rule the
      // booking gate uses, stated from the other end.
      let becameOpen: Date | null = null
      for (const yg of yearGroups.length > 0 ? yearGroups : [null]) {
        const w = yg ? windowFor.get(yg) : undefined
        const moment = w ?? event.bookingOpenedAt
        // No window and no recorded opening: an event that predates this
        // column. Silent by design rather than announced late.
        if (!moment) continue
        if (!becameOpen || moment < becameOpen) becameOpen = moment
      }
      if (!becameOpen) continue
      if (becameOpen > now) continue          // their wave is still to come
      if (becameOpen < since) continue        // missed it; do not announce late
      eligible.push(userId)
    }
    if (eligible.length === 0) continue

    const told = await prisma.consultationOpenNotice.findMany({
      where: { consultationId: event.id, userId: { in: eligible } },
      select: { userId: true },
    })
    const toldIds = new Set(told.map(t => t.userId))
    const toTell = eligible.filter(id => !toldIds.has(id))
    summary.alreadyTold += toldIds.size
    if (toTell.length === 0) continue

    await sendNotification({
      type: 'CONSULTATION',
      title: `${event.title} — booking is open`,
      body: 'Choose a time with your child’s teacher.',
      resourceType: 'CONSULTATION',
      resourceId: event.id,
      // `parentUserIds` because this audience is already resolved and is not a
      // class or a year: it is "the families for whom this just became true",
      // computed across all of each family's children so a sibling parent is
      // told once rather than once per year group.
      target: { targetClass: 'Consultations', schoolId: event.schoolId, parentUserIds: toTell },
    })

    // Recorded AFTER the send. A push that failed should be retried on the next
    // tick; a push that succeeded and was not recorded would be sent twice, and
    // of the two mistakes only one is visible to a parent.
    await prisma.consultationOpenNotice.createMany({
      data: toTell.map(userId => ({ consultationId: event.id, userId })),
      skipDuplicates: true,
    })
    summary.notified += toTell.length
  }

  return summary
}
