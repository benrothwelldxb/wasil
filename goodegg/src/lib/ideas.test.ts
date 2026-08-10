import { describe, it, expect } from 'vitest'
import { templateIdeaProvider, nextIdea, formatCost } from './ideas'
import type { BuddyProfile } from './types'

const sarah: BuddyProfile = {
  id: 'bp',
  group_id: 'g',
  profile_id: 'sarah',
  preferred_name: 'Sarah',
  birthday: null,
  drink: 'Flat white, oat milk',
  sweet_or_savoury: 'sweet',
  favourite_snacks: ['Cadbury Dairy Milk'],
  favourite_shops: ['M&S'],
  interests: ['Houseplants', 'Arsenal'],
  favourite_colours: ['Green'],
  little_things: 'Nice pens and silly desk decorations',
  dislikes: ['Turkish Delight'],
  dietary_requirements: [],
  free_text: '',
  updated_at: '',
}

describe('idea engine', () => {
  it('suggests the flat white for a coffee drinker', () => {
    const idea = nextIdea({ profile: sarah, filters: { budget: 'any', type: 'drink' } })
    expect(idea?.operation).toBe('Operation Flat White')
    expect(idea?.description).toMatch(/Sarah’s favourite/)
    expect(idea?.note).toContain('Your Secret Buddy')
  })

  it('free budget returns only £0 ideas (a note always qualifies)', () => {
    const ideas = templateIdeaProvider.generate({ profile: sarah, filters: { budget: 'free', type: 'anything' } })
    expect(ideas.length).toBeGreaterThan(0)
    expect(ideas.every((i) => i.cost === 0)).toBe(true)
    expect(ideas.some((i) => /note|thank/i.test(i.title))).toBe(true)
  })

  it('never suggests a disliked food', () => {
    const ideas = templateIdeaProvider.generate({ profile: sarah, filters: { budget: 'any', type: 'anything' } })
    for (const i of ideas) {
      if (i.type === 'treat' || i.type === 'drink') {
        expect(i.description.toLowerCase()).not.toContain('turkish delight')
      }
    }
  })

  it('type filter narrows results', () => {
    const ideas = templateIdeaProvider.generate({ profile: sarah, filters: { budget: 'any', type: 'desk' } })
    expect(ideas.every((i) => i.type === 'desk')).toBe(true)
  })

  it('cursor rotates through the set for "another idea"', () => {
    const a = nextIdea({ profile: sarah, filters: { budget: 'any', type: 'anything' }, cursor: 0 })
    const b = nextIdea({ profile: sarah, filters: { budget: 'any', type: 'anything' }, cursor: 1 })
    expect(a?.title).not.toBe(b?.title)
  })

  it('formats cost', () => {
    expect(formatCost(0)).toBe('Free')
    expect(formatCost(4)).toBe('~£4')
  })
})
