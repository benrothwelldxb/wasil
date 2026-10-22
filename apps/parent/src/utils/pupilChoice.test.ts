import { describe, it, expect } from 'vitest'
import type { FormField } from '@wasil/shared'
import { pupilChoiceOptions } from './pupilChoice'

/** C14: a room-sharing choice never offers the child being answered for, nor
 *  a pupil already chosen in the form's other pupil choice. */
const options = [
  { value: 'hub-aisha', label: 'Aisha R.' },
  { value: 'hub-jade', label: 'Jade W.' },
  { value: 'hub-omar', label: 'Omar H.' },
]
const field = (id: string): FormField => ({ id, type: 'pupil_choice', label: id, required: false, removable: false, pupilOptions: options })
const fields = [field('friend_1'), field('friend_2')]

describe('pupilChoiceOptions', () => {
  it('leaves out the child being answered for', () => {
    expect(pupilChoiceOptions(fields[0], fields, {}, 'hub-omar').map(o => o.label)).toEqual(['Aisha R.', 'Jade W.'])
  })

  it('leaves out a pupil chosen in another pupil choice, but keeps its own', () => {
    const answers = { friend_1: 'hub-jade', friend_2: 'hub-aisha' }
    expect(pupilChoiceOptions(fields[0], fields, answers, 'hub-omar').map(o => o.value)).toEqual(['hub-jade'])
  })

  it('offers everyone when the child has no Hub id', () => {
    expect(pupilChoiceOptions(fields[0], fields, {}, null)).toHaveLength(3)
  })
})
