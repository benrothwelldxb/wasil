import { describe, it, expect } from 'vitest'
import type { Form, FormChildState, FormResponseData } from '@wasil/shared'
import { formProgress, withAnswer } from './perChildForm'

/**
 * A trip consent form is answered once per CHILD.
 *
 * A parent with two children on the trip must be asked twice, and the post
 * must not say "Completed" after the first answer — that is exactly how the
 * second child ends up without consent and off the departure register.
 */

const child = (studentId: string, name: string, answered = false): FormChildState => ({
  studentId,
  name,
  response: answered
    ? { id: `r-${studentId}`, answers: { consent: 'Yes' }, answeredBy: 'Karim Haddad', createdAt: 'x', updatedAt: 'x' }
    : null,
})
const form = (over: Partial<Form>): Form => ({
  id: 'f-1', title: 'Consent', type: 'permission-consent', status: 'ACTIVE', fields: [],
  targetClass: 'Selected pupils', classIds: [], yearGroupIds: [], schoolId: 's',
  createdAt: 'x', updatedAt: 'x', ...over,
})
const result: FormResponseData = { id: 'r-new', formId: 'f-1', userId: 'p-1', answers: { consent: 'Yes' }, createdAt: '2026-10-11T08:00:00.000Z' }

describe('formProgress, per child', () => {
  it('asks for the first child still waiting', () => {
    const p = formProgress(form({ perChild: true, children: [child('a', 'Omar', true), child('b', 'Lina')] }))
    expect(p.active?.name).toBe('Lina')
    expect(p.awaitingAnswer).toBe(true)
    expect(p.done).toBe(false)
  })

  it('is done only when every child has an answer, whoever gave it', () => {
    const p = formProgress(form({ perChild: true, children: [child('a', 'Omar', true), child('b', 'Lina', true)] }))
    expect(p.done).toBe(true)
    expect(p.awaitingAnswer).toBe(false)
  })

  it('shows nothing, and no "Completed", when it asks about none of this parent\'s children', () => {
    const p = formProgress(form({ perChild: true, children: [] }))
    expect(p.done).toBe(false)
    expect(p.awaitingAnswer).toBe(false)
  })
})

describe('formProgress, once per family', () => {
  it('is unchanged: answered once, done', () => {
    expect(formProgress(form({})).awaitingAnswer).toBe(true)
    expect(formProgress(form({ userResponse: result })).done).toBe(true)
  })
})

describe('withAnswer', () => {
  it('marks only that child answered, and keeps the form open for the other', () => {
    const next = withAnswer(form({ perChild: true, children: [child('a', 'Omar'), child('b', 'Lina')] }), result, 'a')
    expect(next.children!.map(c => !!c.response)).toEqual([true, false])
    expect(next.userResponse).toBeNull()
    expect(formProgress(next).active?.name).toBe('Lina')
  })

  it('completes the form with the last child', () => {
    const next = withAnswer(form({ perChild: true, children: [child('a', 'Omar', true), child('b', 'Lina')] }), result, 'b')
    expect(next.userResponse).toEqual(result)
    expect(formProgress(next).done).toBe(true)
  })

  it('records an ordinary form\'s answer as before', () => {
    expect(withAnswer(form({}), result).userResponse).toEqual(result)
  })
})
