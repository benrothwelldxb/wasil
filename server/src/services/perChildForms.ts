// Per-child forms: which of a parent's children a form is asking about, and
// what has been answered for each.
//
// A per-child form (Form.perChild) is answered once per CHILD. A parent with
// two children on a trip answers twice, and either linked guardian may answer
// for a child. Each guardian's own answer is kept (FormGuardianAnswer); the
// answer that STANDS for the child is FormResponse, derived from them:
//
//   - a consent form (Form.consentFieldId set): one guardian's Yes stands. The
//     other guardian's No does not overturn it, and a first No does not stop
//     the other guardian being asked. The school's trip policy.
//   - any other per-child form (a room choice): the latest answer stands.
//
// WHAT A PARENT SEES on a consent form is their own answer, never the other
// guardian's. A No from the other parent is not shown at all: the child is
// still waiting for this parent's answer. A Yes from the other parent settles
// it, so the child shows as answered, but with none of that answer's content.
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
  hubPupilId?: string | null
}

export interface ChildFormState {
  studentId: string
  name: string
  /** So a pupil choice (C14) can leave out the child being answered for. */
  hubPupilId: string | null
  response: {
    id: string
    answers: unknown
    answeredBy: string
    createdAt: string
    updatedAt: string
  } | null
  /** This parent's own answer, on a consent form only, so they can see and
   *  change it before the deadline. Absent on every other form. */
  yourAnswer?: {
    answers: unknown
    updatedAt: string
  } | null
}

export interface GuardianAnswerRow {
  id: string
  userId: string
  answers: unknown
  updatedAt: Date
}

/** Whether this answer gives consent on the form's consent question. Answers
 *  are stored in English whatever language they were given in. */
export function saysYes(answers: unknown, consentFieldId: string): boolean {
  return !!answers && typeof answers === 'object' && (answers as Record<string, unknown>)[consentFieldId] === 'Yes'
}

/**
 * The answer that stands for a child, from every guardian's own answer.
 * Consent form: the latest Yes if there is one, otherwise the latest answer.
 * Any other form: the latest answer. Null when nobody has answered.
 */
export function effectiveAnswer<T extends GuardianAnswerRow>(rows: T[], consentFieldId: string | null): T | null {
  const latestFirst = [...rows].sort((a, b) =>
    b.updatedAt.getTime() - a.updatedAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
  if (consentFieldId) {
    const yes = latestFirst.find(r => saysYes(r.answers, consentFieldId))
    if (yes) return yes
  }
  return latestFirst[0] ?? null
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Bring FormResponse into line with the guardian answers for one child. Its
 *  updatedAt moves on every change, so a partner reading with a cursor sees
 *  that something changed even when the answer standing did not. */
async function settleChild(tx: Tx, formId: string, studentId: string, consentFieldId: string | null) {
  const rows = await tx.formGuardianAnswer.findMany({
    where: { formId, studentId },
    select: { id: true, userId: true, answers: true, updatedAt: true },
  })
  const standing = effectiveAnswer(rows, consentFieldId)
  if (!standing) {
    await tx.formResponse.deleteMany({ where: { formId, studentId } })
    return
  }
  await tx.formResponse.upsert({
    where: { formId_studentId: { formId, studentId } },
    update: { answers: standing.answers as object, userId: standing.userId, updatedAt: new Date() },
    create: { formId, studentId, userId: standing.userId, answers: standing.answers as object },
  })
}

/** One answer per child at a time: two guardians answering for the same child
 *  at once must not each settle the child from a view missing the other. */
async function lockChild(tx: Tx, formId: string, studentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`form-child:${formId}:${studentId}`}, 0))`
}

/**
 * Record one guardian's answer for a child and settle the answer that stands.
 * Returns this guardian's own answer, which is what they are shown: never the
 * standing answer, which may be the other guardian's.
 */
export async function recordChildAnswer(input: {
  formId: string
  studentId: string
  userId: string
  answers: object
  consentFieldId: string | null
}) {
  const { formId, studentId, userId, answers, consentFieldId } = input
  return prisma.$transaction(async tx => {
    await lockChild(tx, formId, studentId)
    const mine = await tx.formGuardianAnswer.upsert({
      where: { formId_studentId_userId: { formId, studentId, userId } },
      update: { answers },
      create: { formId, studentId, userId, answers },
    })
    await settleChild(tx, formId, studentId, consentFieldId)
    return mine
  })
}

/**
 * Remove a guardian's answers on per-child forms (their account is being
 * deleted) and re-settle each child they had answered for, so the other
 * guardian's answer stands rather than the child going unanswered.
 */
export async function removeGuardianAnswers(userId: string) {
  const mine = await prisma.formGuardianAnswer.findMany({
    where: { userId },
    select: { formId: true, studentId: true, form: { select: { consentFieldId: true } } },
  })
  for (const a of mine) {
    await prisma.$transaction(async tx => {
      await lockChild(tx, a.formId, a.studentId)
      await tx.formGuardianAnswer.deleteMany({ where: { formId: a.formId, studentId: a.studentId, userId } })
      await settleChild(tx, a.formId, a.studentId, a.form.consentFieldId)
    })
  }
}

/** The parent's children in the shape the eligibility check needs, from the
 *  user `loadUserWithRelations` returns. */
export function parentChildrenOf(user: {
  studentLinks?: Array<{
    studentId: string
    student: {
      firstName?: string; lastName?: string; classId?: string | null; hubPupilId?: string | null
      class?: { yearGroupId?: string | null } | null
    }
  }> | null
}): ParentChild[] {
  return (user.studentLinks ?? []).map(l => ({
    id: l.studentId,
    firstName: l.student.firstName ?? '',
    lastName: l.student.lastName ?? '',
    classId: l.student.classId ?? null,
    yearGroupId: l.student.class?.yearGroupId ?? null,
    hubPupilId: l.student.hubPupilId ?? null,
  }))
}

/**
 * For each per-child form, the parent's children it asks about, in the order
 * they are linked, each with its answer as THIS parent may see it (see the
 * top of this file) or null when it is still waiting for them.
 */
export async function perChildFormStates(
  formIds: string[],
  children: ParentChild[],
  userId: string,
): Promise<Map<string, ChildFormState[]>> {
  const out = new Map<string, ChildFormState[]>()
  if (formIds.length === 0 || children.length === 0) return out
  const childIds = children.map(c => c.id)

  const [forms, posts, groupLinks, responses, own] = await Promise.all([
    prisma.form.findMany({ where: { id: { in: formIds } }, select: { id: true, consentFieldId: true } }),
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
    prisma.formGuardianAnswer.findMany({
      where: { formId: { in: formIds }, studentId: { in: childIds }, userId },
      select: { id: true, formId: true, studentId: true, answers: true, createdAt: true, updatedAt: true },
    }),
  ])
  const consentFieldOf = new Map(forms.map(f => [f.id, f.consentFieldId]))

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
    const consentFieldId = consentFieldOf.get(formId) ?? null
    out.set(formId, asked.map(child => {
      const r = responses.find(x => x.formId === formId && x.studentId === child.id)
      const base = {
        studentId: child.id,
        name: `${child.firstName} ${child.lastName}`.trim(),
        hubPupilId: child.hubPupilId ?? null,
      }
      if (consentFieldId) {
        const mine = own.find(x => x.formId === formId && x.studentId === child.id)
        return {
          ...base,
          // Settled for this parent by their own answer, or by the other
          // guardian's Yes, whose content they are not shown.
          response: mine ? {
            id: mine.id,
            answers: mine.answers,
            answeredBy: '',
            createdAt: mine.createdAt.toISOString(),
            updatedAt: mine.updatedAt.toISOString(),
          } : r && saysYes(r.answers, consentFieldId) ? {
            id: r.id,
            answers: {},
            answeredBy: '',
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          } : null,
          yourAnswer: mine ? { answers: mine.answers, updatedAt: mine.updatedAt.toISOString() } : null,
        }
      }
      return {
        ...base,
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
