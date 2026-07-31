/** Formatting helpers shared across features. */

/** Format a numeric amount as currency using the browser locale. */
export function formatCurrency(
  amount: number,
  currency = 'GBP',
  locale?: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount)
}

/** Human-friendly relative-ish date, e.g. "Today", "Yesterday", or a date. */
export function formatDate(input: number | Date, locale?: string): string {
  const date = typeof input === 'number' ? new Date(input) : input
  const now = new Date()
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days > 1 && days < 7) return `${days} days ago`

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date)
}
