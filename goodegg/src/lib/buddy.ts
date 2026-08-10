import type { BuddyProfile } from './types'

/** Up to three compact summary tags, e.g. ["Coffee lover", "Plant parent", "Arsenal fan"]. */
export function buddySummaryTags(bp: BuddyProfile): string[] {
  const tags: string[] = []
  if (/coffee|flat white|latte|espresso|cappuccino/i.test(bp.drink)) tags.push('Coffee lover')
  else if (/tea|chai/i.test(bp.drink)) tags.push('Tea drinker')
  if (bp.interests.some((i) => /plant|garden/i.test(i))) tags.push('Plant parent')
  const team = bp.interests.find((i) =>
    /arsenal|chelsea|united|city|liverpool|spurs|tottenham|villa/i.test(i),
  )
  if (team) tags.push(`${team} fan`)
  for (const i of bp.interests) {
    if (tags.length >= 3) break
    if (!tags.some((t) => t.toLowerCase().includes(i.toLowerCase()))) tags.push(i)
  }
  if (tags.length === 0 && bp.sweet_or_savoury) {
    tags.push(bp.sweet_or_savoury === 'both' ? 'Sweet & savoury' : `${bp.sweet_or_savoury[0]!.toUpperCase()}${bp.sweet_or_savoury.slice(1)} tooth`)
  }
  return tags.slice(0, 3)
}

export interface BuddyFact {
  icon: string
  text: string
}

/** The scannable, emoji-led fact list for the buddy profile view. */
export function buddyFacts(bp: BuddyProfile): BuddyFact[] {
  const facts: BuddyFact[] = []
  if (bp.drink) facts.push({ icon: '☕', text: bp.drink })
  if (bp.interests.some((i) => /plant|garden/i.test(i))) facts.push({ icon: '🌿', text: 'Plant parent (proud!)' })
  if (bp.favourite_snacks.length) {
    const sweet = bp.favourite_snacks.join(', ')
    const noNo = bp.dislikes.length ? ` — not ${bp.dislikes.join(', ')}` : ''
    facts.push({ icon: '🍫', text: `Loves ${sweet}${noNo}` })
  }
  const team = bp.interests.find((i) =>
    /arsenal|chelsea|united|city|liverpool|spurs|tottenham|villa/i.test(i),
  )
  if (team) facts.push({ icon: '⚽', text: `${team} fan` })
  if (bp.favourite_shops.length) facts.push({ icon: '🛍', text: bp.favourite_shops.join(', ') })
  if (bp.favourite_colours.length) facts.push({ icon: '🎨', text: bp.favourite_colours.join(' & ') })
  if (bp.little_things) facts.push({ icon: '✏️', text: bp.little_things })
  if (bp.dietary_requirements.length) facts.push({ icon: '🥗', text: bp.dietary_requirements.join(', ') })
  if (bp.free_text) facts.push({ icon: '💫', text: bp.free_text })
  return facts
}
