/**
 * Be a Good Egg — surprise idea engine.
 *
 * Generates thoughtful, low-cost "little surprise" ideas from a buddy's
 * preferences using a curated template library — NO AI API. The IdeaProvider
 * interface is the extension point: a future AiIdeaProvider can implement the
 * same contract and be swapped in (or blended) without touching the UI.
 *
 * Product principles honoured here:
 *   • kindness, not gifts — a handwritten note ranks alongside anything bought
 *   • surprise over "gift" — language stays warm and never pushy about spending
 */
import type { BuddyProfile } from './types'

export type IdeaBudget = 'free' | 'under3' | 'under5' | 'under10' | 'any'
export type IdeaType = 'treat' | 'drink' | 'thoughtful' | 'funny' | 'desk' | 'anything'

export interface SurpriseIdea {
  id: string
  /** Playful codename, e.g. "Operation Flat White". */
  operation: string
  title: string
  description: string
  /** Approximate cost in whole £. 0 means free / no spending needed. */
  cost: number
  type: Exclude<IdeaType, 'anything'>
  /** Optional suggested anonymous note. */
  note?: string
  tags: string[]
}

export interface IdeaFilters {
  budget: IdeaBudget
  type: IdeaType
}

export interface IdeaRequest {
  profile: BuddyProfile
  filters: IdeaFilters
  /** Rotate results so "Another idea" feels fresh. */
  cursor?: number
  /** Deterministic ordering. */
  seed?: number
}

export interface IdeaProvider {
  readonly id: string
  generate(req: IdeaRequest): SurpriseIdea[]
}

const BUDGET_CAP: Record<IdeaBudget, number> = {
  free: 0,
  under3: 3,
  under5: 5,
  under10: 10,
  any: Number.POSITIVE_INFINITY,
}

const NOTE_SIGNOFF = '— Your Secret Buddy'

function lower(list: string[]): string[] {
  return list.map((s) => s.toLowerCase())
}
function has(list: string[] | string, ...needles: string[]): boolean {
  const arr = Array.isArray(list) ? list : [list]
  const l = lower(arr)
  return needles.some((n) => l.some((v) => v.includes(n.toLowerCase())))
}
function first(list: string[], fallback = ''): string {
  return list[0]?.trim() || fallback
}
/** Possessive form of a name, or "their" when unknown. */
function possessive(name: string): string {
  const n = name?.trim()
  if (!n) return 'their'
  return /s$/i.test(n) ? `${n}’` : `${n}’s`
}

/** Each template inspects the profile and may emit an idea (or null). */
type Template = (p: BuddyProfile) => Omit<SurpriseIdea, 'id'> | null

const TEMPLATES: Template[] = [
  // --- Drinks ---
  (p) => {
    const drink = p.drink?.trim()
    if (!drink) return null
    const isCoffee = /coffee|flat white|latte|cappuccino|espresso|americano|mocha/i.test(
      drink,
    )
    return {
      operation: isCoffee ? 'Operation Flat White' : 'Operation Warm Cup',
      title: `Their usual: ${drink}`,
      description: `Pick up ${possessive(p.preferred_name)} favourite — a ${drink.toLowerCase()} — and leave it quietly on their desk before they arrive.`,
      cost: isCoffee ? 4 : 3,
      type: 'drink',
      note: `Emergency caffeine delivery. ${NOTE_SIGNOFF}`,
      tags: ['drink', 'desk'],
    }
  },
  // --- Sweet treats ---
  (p) => {
    if (p.sweet_or_savoury === 'savoury') return null
    const snack = first(p.favourite_snacks)
    if (!snack && p.sweet_or_savoury == null) return null
    return {
      operation: 'Operation Sweet Spot',
      title: snack ? `A little ${snack}` : 'A small sweet treat',
      description: snack
        ? `Leave a small pack of ${snack} where they'll find it mid-afternoon.`
        : 'A small sweet treat tucked by their keyboard for the 3pm slump.',
      cost: 2,
      type: 'treat',
      note: `Spotted these and thought of you. ${NOTE_SIGNOFF}`,
      tags: ['treat', 'sweet'],
    }
  },
  // --- Savoury treats ---
  (p) => {
    if (p.sweet_or_savoury === 'sweet') return null
    if (!has(p.favourite_snacks, 'crisp', 'nut', 'savoury', 'popcorn', 'pretzel'))
      if (p.sweet_or_savoury !== 'savoury' && p.sweet_or_savoury !== 'both') return null
    return {
      operation: 'Operation Snack Attack',
      title: 'A moreish savoury snack',
      description: `A little bag of something savoury (${first(p.favourite_snacks, 'crisps or nuts')}) left ready for their break.`,
      cost: 2,
      type: 'treat',
      note: `A little something for later. ${NOTE_SIGNOFF}`,
      tags: ['treat', 'savoury'],
    }
  },
  // --- Handwritten note (always free, always valid) ---
  (p) => ({
    operation: 'Operation Kind Words',
    title: 'A handwritten note',
    description: `Leave an anonymous note that mentions something specific — ${
      first(p.interests) || p.little_things.trim() || 'a small win from their week'
    }. No spending required; often the nicest surprise of all.`,
    cost: 0,
    type: 'thoughtful',
    note: `You're doing brilliantly. Here's a little cheer from your corner. ${NOTE_SIGNOFF}`,
    tags: ['thoughtful', 'free', 'note'],
  }),
  // --- Desk decoration / plants ---
  (p) => {
    if (!has(p.interests, 'plant', 'garden', 'houseplant') && !has(p.little_things, 'plant', 'desk'))
      return null
    return {
      operation: 'Operation Desk Garden',
      title: 'A tiny plant or cutting',
      description: `A small succulent or a rooted cutting for their desk. If you have a plant at home, a free cutting in a jar is lovely.`,
      cost: 4,
      type: 'desk',
      note: `A little green friend for your desk. ${NOTE_SIGNOFF}`,
      tags: ['desk', 'plants'],
    }
  },
  // --- Stationery (nice pens / notebooks) ---
  (p) => {
    if (!has(p.little_things, 'pen', 'notebook', 'stationery') && !has(p.interests, 'stationery'))
      return null
    return {
      operation: 'Operation Fresh Page',
      title: 'A nice pen or notebook',
      description: `A single good pen or a pretty notebook — the small upgrade that makes the workday nicer.`,
      cost: 5,
      type: 'thoughtful',
      note: `For your best ideas. ${NOTE_SIGNOFF}`,
      tags: ['thoughtful', 'stationery'],
    }
  },
  // --- Funny / silly desk surprise ---
  (p) => {
    if (!has(p.little_things, 'silly', 'funny', 'decoration') && p.free_text.length === 0)
      return null
    return {
      operation: 'Operation Desk Mischief',
      title: 'A silly desk surprise',
      description: `A tiny rubber duck, a googly-eyed stapler, or a daft desk ornament to make them grin between meetings.`,
      cost: 3,
      type: 'funny',
      note: `Every desk needs a bit of nonsense. ${NOTE_SIGNOFF}`,
      tags: ['funny', 'desk'],
    }
  },
  // --- Favourite shop voucher / pick-up ---
  (p) => {
    const shop = first(p.favourite_shops)
    if (!shop) return null
    return {
      operation: 'Operation Little Luxury',
      title: `Something small from ${shop}`,
      description: `A small treat picked from ${shop} — you know their taste now. Keep it little; it's the thought that lands.`,
      cost: 8,
      type: 'treat',
      note: `Saw this in ${shop} and had to. ${NOTE_SIGNOFF}`,
      tags: ['treat', 'shops'],
    }
  },
  // --- Colour-themed thoughtful touch ---
  (p) => {
    const colour = first(p.favourite_colours)
    if (!colour) return null
    return {
      operation: 'Operation True Colours',
      title: `A touch of ${colour}`,
      description: `Something small in their favourite colour (${colour}) — a sticky-note stack, a bookmark, a hair tie. Tiny but personal.`,
      cost: 3,
      type: 'thoughtful',
      note: `A little ${colour.toLowerCase()} to brighten the desk. ${NOTE_SIGNOFF}`,
      tags: ['thoughtful', 'colour'],
    }
  },
  // --- Free: a genuine compliment via a mission-style dare ---
  () => ({
    operation: 'Operation Good Word',
    title: 'A well-timed thank you',
    description:
      'Anonymously (or via the organiser) pass on a genuine, specific thank-you for something they did recently. Costs nothing, means everything.',
    cost: 0,
    type: 'thoughtful',
    note: `That thing you did last week did not go unnoticed. ${NOTE_SIGNOFF}`,
    tags: ['thoughtful', 'free'],
  }),
]

/** Respect dietary requirements & dislikes by dropping obviously bad ideas. */
function safeForBuddy(idea: Omit<SurpriseIdea, 'id'>, p: BuddyProfile): boolean {
  const avoid = lower([...p.dislikes, ...p.dietary_requirements])
  if (avoid.length === 0) return true
  const hay = `${idea.title} ${idea.description} ${idea.tags.join(' ')}`.toLowerCase()
  // If a disliked/allergen word appears in a food idea, skip it.
  const foody = idea.type === 'treat' || idea.type === 'drink'
  if (!foody) return true
  return !avoid.some((word) => word.length > 2 && hay.includes(word))
}

function seededSort<T>(arr: T[], seed: number): T[] {
  return arr
    .map((v, i) => ({ v, k: ((i + 1) * 2654435761 * (seed + 1)) % 1000 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.v)
}

/** The default, no-AI provider. */
export const templateIdeaProvider: IdeaProvider = {
  id: 'template',
  generate({ profile, filters, cursor = 0, seed = 1 }: IdeaRequest): SurpriseIdea[] {
    const cap = BUDGET_CAP[filters.budget]
    let ideas = TEMPLATES.map((t) => t(profile)).filter(
      (x): x is Omit<SurpriseIdea, 'id'> => x !== null,
    )

    ideas = ideas.filter((i) => i.cost <= cap)
    if (filters.type !== 'anything') ideas = ideas.filter((i) => i.type === filters.type)
    ideas = ideas.filter((i) => safeForBuddy(i, profile))

    // De-duplicate by title
    const seen = new Set<string>()
    ideas = ideas.filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true)))

    const ordered = seededSort(ideas, seed)
    // Rotate by cursor so "Another idea" cycles through the set.
    const rotated =
      ordered.length > 0
        ? ordered.map((_, idx) => ordered[(idx + cursor) % ordered.length]!)
        : ordered

    return rotated.map((i, idx) => ({ ...i, id: `idea-${seed}-${cursor}-${idx}` }))
  },
}

/** Convenience: the single "next" idea for the Get-an-idea screen. */
export function nextIdea(req: IdeaRequest): SurpriseIdea | null {
  return templateIdeaProvider.generate(req)[0] ?? null
}

export function formatCost(cost: number): string {
  return cost <= 0 ? 'Free' : `~£${cost}`
}
