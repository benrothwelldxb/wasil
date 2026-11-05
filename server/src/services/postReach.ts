import prisma from './prisma.js'

/**
 * Who has seen a post — counted in CHILDREN, because the roll is the number a
 * school holds in its head. Most children here have two linked adults, so a
 * per-parent count reads as nearly double the class and cannot be checked
 * against anything. A child counts as reached once ANY of their linked adults
 * has seen the post; the parent figure is reported alongside, never instead.
 *
 * The audience is the post's audience as it stands NOW, resolved the same way
 * the send resolves it (group, then whole school, then year group, then class).
 * A child who joined the class after the post went out is in it; one who has
 * left is not. That is the question being asked — "who in Year 3 hasn't seen
 * this" — even though it is not quite who was notified at the time.
 *
 * "Seen" is a parent having had the post on screen, or having acknowledged it
 * (which cannot be done without seeing it). It is not "read", and nothing here
 * says it is.
 */

type AudienceFields = {
  schoolId: string
  targetClass: string
  classId: string | null
  yearGroupId: string | null
  groupId: string | null
}

export interface ReachParent {
  id: string
  name: string
  seenAt: string | null
  acknowledgedAt: string | null
}

export interface ReachChild {
  studentId: string
  name: string
  className: string
  seen: boolean
  parents: ReachParent[]
}

export interface PostReach {
  /** False for a post whose audience cannot be resolved (a legacy row naming
   *  a class by text only). Then only the parents who saw it are listed. */
  audienceKnown: boolean
  children: { total: number; seen: number; noParentOnConnect: number }
  parents: { total: number; seen: number }
  rows: ReachChild[]
  /** Parents who saw it but have no child in the current audience — a family
   *  who has since left, or a pupil who moved class. Kept so the counts above
   *  never silently disagree with the list of everyone who saw it. */
  otherViewers: ReachParent[]
  /** The earliest sighting recorded at this school. A post older than this
   *  went out before tracking existed, so its "not seen" means "not known". */
  trackingSince: string | null
}

function audienceStudentWhere(m: AudienceFields) {
  const base = { schoolId: m.schoolId, leftAt: null, isTest: false }
  if (m.groupId) return { ...base, groupLinks: { some: { groupId: m.groupId } } }
  if (m.targetClass === 'Whole School') return base
  if (m.yearGroupId) return { ...base, class: { yearGroupId: m.yearGroupId } }
  if (m.classId) return { ...base, classId: m.classId }
  return null
}

export async function postReach(message: AudienceFields & { id: string }): Promise<PostReach> {
  const studentWhere = audienceStudentWhere(message)

  const [students, views, acks, earliest] = await Promise.all([
    studentWhere
      ? prisma.student.findMany({
          where: studentWhere,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            class: { select: { name: true } },
            parentLinks: {
              where: { user: { role: 'PARENT', isTest: false } },
              select: { user: { select: { id: true, name: true } } },
            },
          },
          orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }, { firstName: 'asc' }],
        })
      : Promise.resolve([]),
    prisma.messageView.findMany({
      where: { messageId: message.id, user: { role: 'PARENT', isTest: false } },
      select: { userId: true, createdAt: true, user: { select: { name: true } } },
    }),
    prisma.messageAcknowledgment.findMany({
      where: { messageId: message.id, user: { role: 'PARENT', isTest: false } },
      select: { userId: true, createdAt: true, user: { select: { name: true } } },
    }),
    prisma.messageView.findFirst({
      where: { message: { schoolId: message.schoolId } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])

  const seenAt = new Map(views.map(v => [v.userId, v.createdAt]))
  const ackAt = new Map(acks.map(a => [a.userId, a.createdAt]))
  const names = new Map<string, string>()
  for (const r of [...views, ...acks]) names.set(r.userId, r.user.name)

  const toParent = (id: string, name: string): ReachParent => ({
    id,
    name,
    seenAt: seenAt.get(id)?.toISOString() ?? null,
    acknowledgedAt: ackAt.get(id)?.toISOString() ?? null,
  })
  const hasSeen = (id: string) => seenAt.has(id) || ackAt.has(id)

  const rows: ReachChild[] = students.map(s => {
    const parents = s.parentLinks.map(l => toParent(l.user.id, l.user.name))
    return {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      className: s.class.name,
      seen: parents.some(p => hasSeen(p.id)),
      parents,
    }
  })

  const audienceParents = new Set(rows.flatMap(r => r.parents.map(p => p.id)))
  const otherViewers = [...names.keys()]
    .filter(id => !audienceParents.has(id))
    .map(id => toParent(id, names.get(id)!))

  return {
    audienceKnown: !!studentWhere,
    children: {
      total: rows.length,
      seen: rows.filter(r => r.seen).length,
      noParentOnConnect: rows.filter(r => r.parents.length === 0).length,
    },
    parents: {
      total: audienceParents.size,
      seen: [...audienceParents].filter(hasSeen).length,
    },
    rows,
    otherViewers,
    trackingSince: earliest?.createdAt.toISOString() ?? null,
  }
}
