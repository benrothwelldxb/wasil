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

/** The form after one answer is accepted: for a per-child form, that child is
 *  marked answered, and the form counts as answered only when all are. */
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
            updatedAt: result.createdAt,
          },
        }
      : c,
  )
  return { ...form, children, userResponse: children.every(c => c.response) ? result : null }
}
