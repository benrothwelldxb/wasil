/**
 * Avatar colour palette. Bright, high-contrast hues that read well with white
 * initials in both light and dark mode.
 */
export const PERSON_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#10b981', // emerald
  '#14b8a6', // teal
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#84cc16', // lime
] as const

/**
 * Pick a colour for a new person: the first palette colour not already in use,
 * falling back to the least-recently-cycled one when every colour is taken.
 */
export function pickColor(usedColors: string[]): string {
  const unused = PERSON_COLORS.find((c) => !usedColors.includes(c))
  if (unused) return unused
  return PERSON_COLORS[usedColors.length % PERSON_COLORS.length]
}
