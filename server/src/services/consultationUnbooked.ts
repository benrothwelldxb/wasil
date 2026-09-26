// Which families have not booked, and could.
//
// The parents who do not book are exactly the ones a school most wants to see,
// and they were invisible: nothing counted them, so chasing meant reading a
// grid of 448 slots and working out who was missing from it.
//
// TWO QUALIFICATIONS, and both matter more than they look.
//
// "COULD" — a family whose wave has not opened is not late, they are early.
// Chasing them is worse than saying nothing: it asks for something the app will
// refuse, and the parent cannot tell those apart. So the same earliest-window
// rule the booking gate uses decides who is even eligible to be chased.
//
// "HAVE NOT BOOKED" — per CHILD, not per family. A parent with two children who
// has booked one is not done, and a nudge that says "you have not booked" to
// someone holding an appointment reads as a system that is not paying
// attention. So the message names the child who is still without one.
import prisma from './prisma.js'

export interface UnbookedFamily {
  parentId: string
  parentName: string
  parentEmail: string | null
  /** The children of theirs with no appointment at this consultation. */
  childrenWithout: string[]
  /** How many of their children already have one — so the message can say
   *  "your other child" rather than implying they have done nothing. */
  bookedCount: number
  lastNudgedAt: Date | null
  nudgeCount: number
}

export interface UnbookedSummary {
  /** Families who can book and have at least one child without an appointment. */
  families: UnbookedFamily[]
  /** Families eligible to book at all — the denominator. */
  eligible: number
  /** Families whose wave has not opened yet. Not chased, and not a failure. */
  waitingForTheirWave: number
}

export async function unbookedFamilies(
  consultationId: string,
  schoolId: string,
  now: Date = new Date(),
): Promise<UnbookedSummary> {
  const empty: UnbookedSummary = { families: [], eligible: 0, waitingForTheirWave: 0 }

  const consultation = await prisma.consultationEvent.findFirst({
    where: { id: consultationId, schoolId },
    select: {
      id: true,
      bookingWindows: { select: { yearGroupId: true, opensAt: true } },
    },
  })
  if (!consultation) return empty

  const links = await prisma.parentStudentLink.findMany({
    where: { student: { schoolId, leftAt: null, isTest: false } },
    select: {
      userId: true,
      studentId: true,
      user: { select: { id: true, name: true, email: true, isTest: true } },
      student: { select: { firstName: true, class: { select: { yearGroupId: true } } } },
    },
  })
  if (links.length === 0) return empty

  const bookings = await prisma.consultationBooking.findMany({
    where: { slot: { consultationTeacher: { consultationId } } },
    select: { studentId: true },
  })
  const bookedStudents = new Set(bookings.map(b => b.studentId).filter(Boolean))

  const nudges = await prisma.consultationNudge.findMany({
    where: { consultationId },
    select: { userId: true, lastNudgedAt: true, count: true },
  })
  const nudgeBy = new Map(nudges.map(n => [n.userId, n]))

  const windowFor = new Map(consultation.bookingWindows.map(w => [w.yearGroupId, w.opensAt]))

  type Acc = {
    parent: { id: string; name: string; email: string | null }
    yearGroups: Array<string | null>
    without: string[]
    booked: number
  }
  const byParent = new Map<string, Acc>()
  for (const l of links) {
    if (!l.user || l.user.isTest) continue
    const acc = byParent.get(l.userId) ?? {
      parent: { id: l.user.id, name: l.user.name, email: l.user.email },
      yearGroups: [],
      without: [],
      booked: 0,
    }
    acc.yearGroups.push(l.student?.class?.yearGroupId ?? null)
    if (bookedStudents.has(l.studentId)) acc.booked++
    else acc.without.push(l.student?.firstName || 'your child')
    byParent.set(l.userId, acc)
  }

  const out: UnbookedFamily[] = []
  let eligible = 0
  let waiting = 0

  for (const [parentId, acc] of byParent) {
    // Their earliest window across all their children — a family in two year
    // groups books everything from the earlier time, which is the sibling rule
    // stated from this end. A child whose year group has no window can book as
    // soon as the event is open.
    let earliest: Date | null = null
    let openNow = false
    for (const yg of acc.yearGroups.length > 0 ? acc.yearGroups : [null]) {
      const w = yg ? windowFor.get(yg) : undefined
      if (!w) { openNow = true; break }
      if (!earliest || w < earliest) earliest = w
    }
    const canBook = openNow || (earliest !== null && earliest <= now)
    if (!canBook) { waiting++; continue }

    eligible++
    if (acc.without.length === 0) continue

    const n = nudgeBy.get(parentId)
    out.push({
      parentId,
      parentName: acc.parent.name,
      parentEmail: acc.parent.email,
      childrenWithout: acc.without,
      bookedCount: acc.booked,
      lastNudgedAt: n?.lastNudgedAt ?? null,
      nudgeCount: n?.count ?? 0,
    })
  }

  // Never nudged first, then longest since — the order a person would chase in.
  out.sort((a, b) => {
    if (!a.lastNudgedAt && b.lastNudgedAt) return -1
    if (a.lastNudgedAt && !b.lastNudgedAt) return 1
    if (!a.lastNudgedAt && !b.lastNudgedAt) return a.parentName.localeCompare(b.parentName)
    return a.lastNudgedAt!.getTime() - b.lastNudgedAt!.getTime()
  })

  return { families: out, eligible, waitingForTheirWave: waiting }
}
