import { describe, it, expect } from 'vitest'
import { formalSchoolName } from '../src/services/schoolName'

/**
 * A school is three columns — name, shortName, city — and the admin header
 * already renders two of them side by side. Email only ever used `name`, so it
 * went out under a shortened version of a name the record held in full.
 */
describe('formalSchoolName', () => {
  it('joins the name and the city', () => {
    expect(formalSchoolName({ name: 'Victory Heights Primary School', city: 'City of Arabia' }))
      .toBe('Victory Heights Primary School - City of Arabia')
  })

  it('is just the name when there is no city', () => {
    expect(formalSchoolName({ name: 'Victory Heights Primary School', city: null }))
      .toBe('Victory Heights Primary School')
  })

  // A school whose name already carries its location shouldn't say it twice.
  it('does not repeat a location the name already contains', () => {
    expect(formalSchoolName({ name: "St Mary's, Dubai", city: 'Dubai' })).toBe("St Mary's, Dubai")
  })

  it('ignores case when checking for the repeat', () => {
    expect(formalSchoolName({ name: 'Dubai British School', city: 'dubai' })).toBe('Dubai British School')
  })

  it('trims stray whitespace rather than rendering it', () => {
    expect(formalSchoolName({ name: '  Victory Heights  ', city: '  City of Arabia  ' }))
      .toBe('Victory Heights - City of Arabia')
  })

  // Emails are sent from background jobs where the school lookup can miss;
  // "School" is the existing fallback and beats an empty subject line.
  it('falls back rather than producing an empty name', () => {
    expect(formalSchoolName(null)).toBe('School')
    expect(formalSchoolName({ name: '   ', city: 'Dubai' })).toBe('School')
  })
})
