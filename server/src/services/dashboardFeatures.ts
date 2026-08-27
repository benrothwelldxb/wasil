// What the school wants parents to notice, on the parent dashboard.
//
// A service can be published, open for registration, and still invisible: it
// lives behind a tab nobody opens. Breakfast club is the standing example — the
// families who most need it are the ones least likely to go browsing.
//
// This is the slot for that. It's deliberately a LIST of neutral cards rather
// than another bespoke banner (the ECA one is hardcoded into the dashboard), so
// other things — activities, events, forms — can be promoted through the same
// place later without the dashboard growing a new gradient each time.
//
// Two rules do most of the work:
//   * A feature only reaches a parent whose child could actually take it up —
//     the same class/year eligibility the services list applies. Promoting
//     something to a family that can't join it is worse than not promoting.
//   * A feature expires. `featuredUntil` in the past is not shown, so a promo
//     nobody remembered to switch off stops being news on its own.
import prisma from './prisma.js'

/** One promoted thing. `kind` is what it is; everything else is what to draw. */
export interface DashboardFeature {
  id: string
  kind: 'SCHOOL_SERVICE'
  title: string
  blurb: string | null
  /** A short "when/where" line, e.g. "Mon–Fri · 07:00–08:00". */
  meta: string | null
  ctaLabel: string
  /** Parent-app route this card opens. */
  href: string
}

/** Days are stored as a JSON array; a bad value must never break the dashboard. */
function parseList(value: string | null | undefined): string[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** "Mon–Fri · 07:00–08:00" — contiguous weekdays collapse to a range. */
function scheduleLine(days: string[], startTime: string, endTime: string): string | null {
  const time = startTime && endTime ? `${startTime}–${endTime}` : null
  if (days.length === 0) return time
  const short = days.map((d) => d.slice(0, 3))
  const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const idx = short.map((d) => WEEK.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b)
  const contiguous =
    idx.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  const dayPart = contiguous ? `${WEEK[idx[0]]}–${WEEK[idx[idx.length - 1]]}` : short.join(', ')
  return time ? `${dayPart} · ${time}` : dayPart
}

/**
 * The features to show one parent, most recently promoted first.
 *
 * Never throws: the dashboard is the first thing a parent sees, and a promo
 * slot failing must not take the rest of it down.
 */
export async function featuresForParent(
  userId: string,
  schoolId: string,
  now: Date = new Date(),
): Promise<DashboardFeature[]> {
  try {
    const services = await prisma.schoolService.findMany({
      where: {
        schoolId,
        featuredOnDashboard: true,
        // A draft or archived service is never promoted, whatever the flag says
        // — the flag says "worth noticing", the status says "real yet".
        status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'ACTIVE'] },
        OR: [{ featuredUntil: null }, { featuredUntil: { gte: now } }],
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    })
    if (services.length === 0) return []

    // Eligibility: the child's class and year, exactly as the services list
    // resolves them.
    const links = await prisma.parentStudentLink.findMany({
      where: { userId },
      select: { student: { select: { classId: true, class: { select: { name: true, yearGroup: { select: { name: true } } } } } } },
    })
    const childClasses = links.map((l) => l.student.class?.name).filter(Boolean) as string[]
    const childYears = links.map((l) => l.student.class?.yearGroup?.name).filter(Boolean) as string[]

    const eligible = services.filter((s) => {
      const classes = parseList(s.eligibleClasses)
      const years = parseList(s.eligibleYears)
      if (classes?.length && !childClasses.some((c) => classes.includes(c))) return false
      if (years?.length && !childYears.some((y) => years.includes(y))) return false
      return true
    })

    return eligible.map((s) => ({
      id: s.id,
      kind: 'SCHOOL_SERVICE' as const,
      title: s.name,
      blurb: s.description,
      meta: scheduleLine(parseList(s.days) ?? [], s.startTime, s.endTime),
      // The call to action follows the status: an open registration is asking
      // for a decision, anything else is just worth knowing about.
      ctaLabel: s.status === 'REGISTRATION_OPEN' ? 'Sign up' : 'Find out more',
      // The parent app has no per-service route, so we deep-link the list and
      // let it scroll to the one being promoted — landing on eight services
      // after tapping "Sign up" for breakfast club is its own small failure.
      href: `/school-services?service=${s.id}`,
    }))
  } catch (error) {
    console.error('Failed to build dashboard features:', error)
    return []
  }
}
