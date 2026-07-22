import { describe, it, expect } from 'vitest'
import { buildReminderResolver, type ReminderItem } from '../src/services/timetableReminders'
import {
  applyOverrides,
  applyOverridesToGrid,
  type OverrideInput,
} from '../src/services/timetableOverrides'

const resolver = buildReminderResolver([
  { subject: 'Swimming', emoji: '🏊', reminder: 'Remember swimwear, towel & goggles' },
  { subject: 'Library', emoji: '📚', reminder: 'Return library books' },
])

const swimming: ReminderItem = { subject: 'Swimming', specialist: true, emoji: '🏊', reminder: 'Remember swimwear, towel & goggles' }
const library: ReminderItem = { subject: 'Library', specialist: false, emoji: '📚', reminder: 'Return library books' }

function cancel(subjectKey: string): OverrideInput {
  return { subjectKey, subject: subjectKey, emoji: null, action: 'CANCELLED' }
}
function add(subject: string, emoji: string | null = null): OverrideInput {
  return { subjectKey: subject.toLowerCase(), subject, emoji, action: 'ADDED' }
}

describe('applyOverrides (net reminder items)', () => {
  it('drops the item matching a CANCELLED override', () => {
    const out = applyOverrides([swimming, library], [cancel('swimming')], resolver)
    expect(out.map((i) => i.subject)).toEqual(['Library'])
  })

  it('matches CANCELLED case-insensitively via subjectKey', () => {
    // Hub item cased "SWIMMING"; override key normalised to "swimming".
    const upper: ReminderItem = { ...swimming, subject: 'SWIMMING' }
    const out = applyOverrides([upper, library], [cancel('swimming')], resolver)
    expect(out.map((i) => i.subject)).toEqual(['Library'])
  })

  it('appends an ADDED override with map-resolved emoji + reminder', () => {
    const out = applyOverrides([library], [add('Swimming')], resolver)
    expect(out).toEqual([
      library,
      { subject: 'Swimming', specialist: false, emoji: '🏊', reminder: 'Remember swimwear, towel & goggles' },
    ])
  })

  it('falls back to a default emoji + reminder for an unmapped ADDED subject', () => {
    const out = applyOverrides([], [add('Chess')], resolver)
    expect(out).toEqual([{ subject: 'Chess', specialist: false, emoji: '📌', reminder: "Don't forget Chess" }])
  })

  it('prefers the override row emoji over the map emoji for ADDED', () => {
    const out = applyOverrides([], [add('Swimming', '🩱')], resolver)
    expect(out[0]).toMatchObject({ subject: 'Swimming', emoji: '🩱' })
  })

  it('is a no-op for unrelated overrides and keeps order stable', () => {
    const out = applyOverrides([swimming, library], [cancel('football')], resolver)
    expect(out).toEqual([swimming, library])
  })

  it('returns the input unchanged when there are no overrides', () => {
    const items = [swimming, library]
    expect(applyOverrides(items, [], resolver)).toBe(items)
  })
})

describe('applyOverridesToGrid (annotated for the read-only grid)', () => {
  const base = [
    { subject: 'Swimming', emoji: '🏊', specialist: true },
    { subject: 'Library', emoji: '📚', specialist: false },
  ]

  it('flags a cancelled subject in place and appends added ones', () => {
    const out = applyOverridesToGrid(base, [cancel('swimming'), add('Chess', '♟️')], resolver)
    expect(out).toEqual([
      { subject: 'Swimming', emoji: '🏊', specialist: true, cancelled: true },
      { subject: 'Library', emoji: '📚', specialist: false },
      { subject: 'Chess', emoji: '♟️', specialist: false, added: true },
    ])
  })

  it('copies the base list unchanged when there are no overrides', () => {
    const out = applyOverridesToGrid(base, [], resolver)
    expect(out).toEqual(base)
    expect(out[0]).not.toBe(base[0]) // fresh objects, safe to annotate
  })
})
