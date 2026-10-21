// Per-child forms: which of a parent's children a form is asking about, and
// what has been answered for each.
//
// A per-child form (Form.perChild) is answered once per CHILD. A parent with
// two children on a trip answers twice; either linked guardian may answer for
// a child, and the latest answer stands for that child.
//
// WHO A FORM IS ASKING ABOUT. A form carries no audience of its own — it is
// announced by the posts it is attached to (see routes/forms.ts). So the
// children it asks about are the parent's children who are in the audience of
// at least one post carrying it: the trip group, the named pupils of a consent
// chaser, a class. A child the group has since dropped (not going, after the
// consent deadline) is no longer asked.
import prisma from './prisma.js'

export interface ParentChild {
  id: string
  firstName: string
  lastName: string
  classId: string | null
  yearGroupId: string | null
}

export interface ChildFormState {
  studentId: string
  name: string
  response: {
    id: string
    answers: unknown
    answeredBy: string
    createdAt: string
    updatedAt: string
  } | null
}

/** The parent's children in the shape the eligibility check needs, from the
 *  user `loadUserWithRelations` returns. */
export function parentChildrenOf(user: {
  studentLinks?: Array<{
    studentId: string
    student: { firstName?: string; lastName?: string; classId?: string | null; class?: { yearGroupId?: string | null } | null }
  }> | null
}): ParentChild[] {
  return (user.studentLinks ?? []).map(l => ({
    id: l.studentId,
    firstName: l.student.firstName ?? '',
    lastName: l.student.lastName ?? '',
    classId: l.student.classId ?? null,
    yearGroupId: l.student.class?.yearGroupId ?? null,
  }))
}

/**
 * For each per-child form, the parent's children it asks about, in the order
 * they are linked, each with its current answer (whoever gave it) or null.
 */
export async function perChildFormStates(
  formIds: string[],
  children: ParentChild[],
): Promise<Map<string, ChildFormState[]>> {
  const out = new Map<string, ChildFormState[]>()
  if (formIds.length === 0 || children.length === 0) return out
  const childIds = children.map(c => c.id)

  const [posts, groupLinks, responses] = await Promise.all([
    prisma.message.findMany({
      where: { formId: { in: formIds } },
      select: {
        formId: true, targetClass: true, classId: true, yearGroupId: true, groupId: true,
        studentTargets: { where: { studentId: { in: childIds } }, select: { studentId: true } },
      },
    }),
    prisma.studentGroupLink.findMany({
      where: { studentId: { in: childIds } },
      select: { studentId: true, groupId: true },
    }),
    prisma.formResponse.findMany({
      where: { formId: { in: formIds }, studentId: { in: childIds } },
      select: {
        id: true, formId: true, studentId: true, answers: true, createdAt: true, updatedAt: true,
        user: { select: { name: true } },
      },
    }),
  ])

  const groupsOf = new Map<string, Set<string>>()
  for (const l of groupLinks) {
    if (!groupsOf.has(l.studentId)) groupsOf.set(l.studentId, new Set())
    groupsOf.get(l.studentId)!.add(l.groupId)
  }

  for (const formId of formIds) {
    const carrying = posts.filter(p => p.formId === formId)
    const asked = children.filter(child => carrying.some(p =>
      (p.groupId && groupsOf.get(child.id)?.has(p.groupId))
      || p.studentTargets.some(t => t.studentId === child.id)
      || (p.classId && p.classId === child.classId)
      || (p.yearGroupId && p.yearGroupId === child.yearGroupId)
      || (p.targetClass === 'Whole School' && !p.classId && !p.yearGroupId && !p.groupId),
    ))
    out.set(formId, asked.map(child => {
      const r = responses.find(x => x.formId === formId && x.studentId === child.id)
      return {
        studentId: child.id,
        name: `${child.firstName} ${child.lastName}`.trim(),
        response: r ? {
          id: r.id,
          answers: r.answers,
          answeredBy: r.user?.name ?? '',
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        } : null,
      }
    }))
  }
  return out
}
