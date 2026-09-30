import { describe, it, expect } from 'vitest'
import { PULSE_TEMPLATES } from '../src/services/pulseTemplates'

/**
 * The ready-made surveys.
 *
 * Choosing questions per survey is the mechanism; these are the shortcut.
 * Defined in code rather than seeded per school, because a seeded row is a copy
 * that rots — improve the wording and every school that adopted early keeps the
 * old one, and a school that deletes one by accident cannot get it back.
 *
 * The tests below are about the RULES a template has to obey, not about the
 * wording, which is the school's to change. Two of those rules would be easy to
 * break while editing the list and expensive to notice afterwards.
 */

const CORE_KEYS = [
  'core_quality',
  'core_belonging',
  'core_communication',
  'core_responsiveness',
  'core_expectations',
  'core_overall_satisfaction',
  'core_improve_now',
]

describe('every template', () => {
  it('keeps the free-text question', () => {
    // The one that produces something to act on, and the only one whose
    // answers a school reads rather than counts.
    for (const t of PULSE_TEMPLATES) {
      expect(t.coreQuestionKeys).toContain('core_improve_now')
    }
  })

  it('asks something', () => {
    for (const t of PULSE_TEMPLATES) {
      expect(t.coreQuestionKeys.length + t.customQuestions.length).toBeGreaterThan(1)
    }
  })

  it('uses only real core question keys', () => {
    // A typo here is silent: the key simply matches nothing and the question
    // quietly is not asked.
    for (const t of PULSE_TEMPLATES) {
      for (const k of t.coreQuestionKeys) expect(CORE_KEYS).toContain(k)
    }
  })

  it('has a unique key and a name', () => {
    const keys = PULSE_TEMPLATES.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const t of PULSE_TEMPLATES) {
      expect(t.name.trim()).not.toBe('')
      expect(t.blurb.trim()).not.toBe('')
    }
  })

  it('never carries a group or year-group id', () => {
    // A template knows the SHAPE of its audience, never which group. Baking an
    // id in would send a new-families survey to whatever group happened to be
    // first — and would be wrong at every school but the one it was written at.
    for (const t of PULSE_TEMPLATES) {
      expect(t).not.toHaveProperty('audienceGroupId')
      expect(t).not.toHaveProperty('audienceYearGroupIds')
    }
  })
})

describe('the ones that carry the trend', () => {
  it('keeps an anchor question in all but the deliberate exception', () => {
    // Comparison matches questions across surveys by key, so a template that
    // drops every anchor gives a clean survey and a broken trend line.
    // "Did that work?" is the one place that trade is right: a two-week
    // follow-up on a car-park change is not something anybody tracks for years.
    const ANCHORS = ['core_quality', 'core_belonging', 'core_overall_satisfaction']
    for (const t of PULSE_TEMPLATES) {
      const hasAnchor = t.coreQuestionKeys.some(k => ANCHORS.includes(k))
      if (t.key === 'did_that_work') {
        expect(hasAnchor).toBe(false)
        continue
      }
      expect(hasAnchor).toBe(true)
    }
  })
})

describe('the set itself', () => {
  it('covers the points in a year a school asks something', () => {
    const keys = PULSE_TEMPLATES.map(t => t.key)
    expect(keys).toEqual([
      'full_termly',
      'start_of_year',
      'new_families',
      'mid_year',
      'end_of_year',
      'moving_on',
      'did_that_work',
    ])
  })

  it('keeps the full termly pulse as the unchanged baseline', () => {
    // What a survey was before any of this. It has to stay the whole seven, or
    // the thing every other template is compared against has moved.
    const full = PULSE_TEMPLATES.find(t => t.key === 'full_termly')!
    expect(full.coreQuestionKeys).toHaveLength(7)
    expect(full.customQuestions).toEqual([])
    expect(full.audienceType).toBe('SCHOOL')
  })

  it('scopes the two that are not for everybody', () => {
    expect(PULSE_TEMPLATES.find(t => t.key === 'new_families')!.audienceType).toBe('GROUP')
    expect(PULSE_TEMPLATES.find(t => t.key === 'moving_on')!.audienceType).toBe('YEAR_GROUPS')
  })
})
