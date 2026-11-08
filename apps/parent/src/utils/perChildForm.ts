import type { Form, FormChildState, FormResponseData } from '@wasil/shared'

/**
 * Where a parent is with a form, once per child or once per family.
 *
 * A per-child form (a trip consent form) is answered once for EACH child it
 * asks about. The children still waiting are asked in turn, in the order the
 * school lists them, and the form is done only when none are left. Kept apart
 * from the card so the rules can be tested without rendering it.
 */
export interface FormProgress {
  /** Null for an ordinary form, answered once per parent. */
  children: FormChildState[] | null
  pending: FormChildState[]
  /** The child the next answer is for. */
  active: FormChildState | null
  /** Done: shows "Completed" and no fields. */
  done: boolean
  /** Fields to show. False for a per-child form asking about none of this
   *  parent's children, which shows nothing to answer and no "Completed". */
  awaitingAnswer: boolean
}

export function formProgress(form: Form | null | undefined): FormProgress {
  if (!form) return { children: null, pending: [], active: null, done: false, awaitingAnswer: false }
  if (!form.perChild) {
    const done = !!form.userResponse
    return { children: null, pending: [], active: null, done, awaitingAnswer: !done }
  }
  const children = form.children ?? []
  const pending = children.filter(c => !c.response)
  return {
    children,
    pending,
    active: pending[0] ?? null,
    done: children.length > 0 && pending.length === 0,
    awaitingAnswer: pending.length > 0,
  }
}

/** Whether this parent may change an answer they gave on this form now: a
 *  consent form, still open, before its deadline. */
export function canChangeAnswers(form: Form | null | undefined, now = new Date()): boolean {
  if (!form?.perChild || !form.consentField || form.status !== 'ACTIVE') return false
  return !form.expiresAt || new Date(form.expiresAt) > now
}

/** The children this parent has answered for themselves and may change. */
export function changeableChildren(form: Form | null | undefined, now = new Date()): FormChildState[] {
  if (!canChangeAnswers(form, now)) return []
  return (form!.children ?? []).filter(c => !!c.yourAnswer)
}

/** The answers to start a change from: the parent's own, except a drawn
 *  signature, which is signed again rather than carried over. */
export function answersToChange(form: Form, child: FormChildState): Record<string, unknown> {
  const own = { ...(child.yourAnswer?.answers ?? {}) }
  for (const f of form.fields ?? []) if (f.type === 'signature') own[f.id] = ''
  return own
}

/** The form after one answer is accepted: for a per-child form, that child is
 *  marked answered, and the form counts as answered only when all are. On a
 *  consent form the answer is also this parent's own, to see and change. */
export function withAnswer(form: Form, result: FormResponseData, studentId?: string): Form {
  if (!form.perChild || !studentId || !form.children) return { ...form, userResponse: result }
  const children = form.children.map(c =>
    c.studentId === studentId
      ? {
          ...c,
          response: {
            id: result.id,
            answers: result.answers,
            answeredBy: '',
            createdAt: result.createdAt,
            updatedAt: result.updatedAt ?? result.createdAt,
          },
          ...(form.consentField
            ? { yourAnswer: { answers: result.answers, updatedAt: result.updatedAt ?? result.createdAt } }
            : {}),
        }
      : c,
  )
  return { ...form, children, userResponse: children.every(c => c.response) ? result : null }
}
