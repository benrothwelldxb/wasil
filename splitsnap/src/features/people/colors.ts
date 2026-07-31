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

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/**
 * Choose black or white text for maximum contrast on a coloured background,
 * so initials on light hues (amber, lime) stay readable (WCAG AA).
 */
export function contrastText(hex: string): '#000000' | '#ffffff' {
  const c = hex.replace('#', '')
  const r = channel(parseInt(c.slice(0, 2), 16))
  const g = channel(parseInt(c.slice(2, 4), 16))
  const b = channel(parseInt(c.slice(4, 6), 16))
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // White wins only for quite dark backgrounds; otherwise black has more
  // contrast (comparing 1.05/(L+0.05) against (L+0.05)/0.05).
  return L < 0.179 ? '#ffffff' : '#000000'
}
