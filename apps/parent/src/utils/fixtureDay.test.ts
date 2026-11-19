import { describe, it, expect } from 'vitest'
import { fixtureCardSignature } from './fixtureDay'

const card = (status: string, sentAts: string[]) => ({
  item: { status },
  updates: sentAts.map((sentAt) => ({ sentAt })),
})

describe('fixtureCardSignature', () => {
  it('is unchanged when nothing new has happened', () => {
    expect(fixtureCardSignature(card('scheduled', ['2026-11-18T10:00:00Z'])))
      .toBe(fixtureCardSignature(card('scheduled', ['2026-11-18T10:00:00Z'])))
  })

  it('changes with a new update from the school, so a hidden card comes back', () => {
    expect(fixtureCardSignature(card('scheduled', ['2026-11-18T10:00:00Z'])))
      .not.toBe(fixtureCardSignature(card('scheduled', ['2026-11-18T10:00:00Z', '2026-11-18T13:00:00Z'])))
  })

  it('changes when the fixture is cancelled', () => {
    expect(fixtureCardSignature(card('scheduled', []))).not.toBe(fixtureCardSignature(card('cancelled', [])))
  })

  it('copes with an update-only card that has no fixture item', () => {
    expect(fixtureCardSignature({ item: null, updates: [{ sentAt: '2026-11-18T10:00:00Z' }] })).toBe('|1|2026-11-18T10:00:00Z')
  })
})
