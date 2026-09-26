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

/** A child with no appointment, and who would be told about it. */
export interface UnbookedChild {
  studentId: string
  childName: string
  guardianNames: string[]
}

export interface UnbookedSummary {
  /** THE HEADLINE, and the only number a school can check.
   *
   *  This used to count PARENT ACCOUNTS and call them families: a child with
   *  two linked guardians counted twice, so a school of 276 children was told
   *  "399 families", which is not a number anybody can verify or act on. The
   *  first person to read it spotted it immediately, which is the tell that a
   *  count is measuring the wrong noun. */
  childrenWithout: UnbookedChild[]
  /** Children who can book at all — the denominator, and never more than the
   *  roll. */
  childrenEligible: number
  /** Children whose family's wave has not opened. Early, not late. */
  childrenWaiting: number
  /** Who to actually notify, deduplicated by parent. A parent with two
   *  unbooked children is told ONCE, naming both — two emails an hour apart
   *  about the same evening reads as a system that has lost track. */
  families: UnbookedFamily[]
}

export async function unbookedFamilies(
  consultationId: string,
  schoolId: string,
  now: Date = new Date(),
): Promise<UnbookedSummary> {
  const empty: UnbookedSummary = {
    childrenWithout: [], childrenEligible: 0, childrenWaiting: 0, families: [],
  }

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
    children: Array<{ studentId: string; firstName: string; yearGroupId: string | null }>
  }
  const byParent = new Map<string, Acc>()
  for (const l of links) {
    if (!l.user || l.user.isTest) continue
    const acc = byParent.get(l.userId) ?? {
      parent: { id: l.user.id, name: l.user.name, email: l.user.email },
      children: [],
    }
    acc.children.push({
      studentId: l.studentId,
      firstName: l.student?.firstName || 'your child',
      yearGroupId: l.student?.class?.yearGroupId ?? null,
    })
    byParent.set(l.userId, acc)
  }

  const out: UnbookedFamily[] = []
  // COUNTED PER CHILD, because that is the number a school can check against
  // its own roll. Keyed by studentId so a child with two linked guardians —
  // 259 of 276 at the first school to use this — is one child, not two. The
  // previous version counted parent accounts and called them families: 399 of
  // them at a school with 276 children. The first person to read it saw that
  // it was wrong in about a second, which is the tell that a count is
  // measuring the wrong noun.
  const withoutByChild = new Map<string, { childName: string; guardianNames: string[] }>()
  const eligibleChildren = new Set<string>()
  const waitingChildren = new Set<string>()

  for (const [parentId, acc] of byParent) {
    // Their earliest window across ALL their children — a family in two year
    // groups books everything from the earlier time, the sibling rule stated
    // from this end. A child whose year group has no window can book as soon
    // as the event is open.
    let earliest: Date | null = null
    let openNow = false
    const yearGroups = acc.children.map(c => c.yearGroupId)
    for (const yg of yearGroups.length > 0 ? yearGroups : [null]) {
      const w = yg ? windowFor.get(yg) : undefined
      if (!w) { openNow = true; break }
      if (!earliest || w < earliest) earliest = w
    }
    const canBook = openNow || (earliest !== null && earliest <= now)

    if (!canBook) {
      for (const c of acc.children) waitingChildren.add(c.studentId)
      continue
    }

    const without: string[] = []
    let booked = 0
    for (const c of acc.children) {
      eligibleChildren.add(c.studentId)
      if (bookedStudents.has(c.studentId)) {
        booked++
        continue
      }
      without.push(c.firstName)
      const entry = withoutByChild.get(c.studentId) ?? { childName: c.firstName, guardianNames: [] }
      entry.guardianNames.push(acc.parent.name)
      withoutByChild.set(c.studentId, entry)
    }
    if (without.length === 0) continue

    const n = nudgeBy.get(parentId)
    out.push({
      parentId,
      parentName: acc.parent.name,
      parentEmail: acc.parent.email,
      childrenWithout: without,
      bookedCount: booked,
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

  return {
    childrenWithout: [...withoutByChild.entries()]
      .map(([studentId, v]) => ({ studentId, childName: v.childName, guardianNames: v.guardianNames }))
      .sort((a, b) => a.childName.localeCompare(b.childName)),
    childrenEligible: eligibleChildren.size,
    // A child whose family cannot book yet but who ALSO has a sibling opening
    // the family earlier is not waiting — the family rule already let them in,
    // so they must not be counted in both.
    childrenWaiting: [...waitingChildren].filter(id => !eligibleChildren.has(id)).length,
    families: out,
  }
}
