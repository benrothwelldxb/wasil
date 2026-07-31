/** Supported currencies and OCR currency detection. */

export interface CurrencyMeta {
  code: CurrencyCode
  /** Symbol used for compact input adornments. */
  symbol: string
  name: string
}

export const SUPPORTED_CURRENCIES = [
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
] as const satisfies readonly CurrencyMeta[]

export type CurrencyCode =
  | 'GBP'
  | 'EUR'
  | 'USD'
  | 'AED'
  | 'AUD'
  | 'CAD'
  | 'JPY'
  | 'CHF'
  | 'SEK'
  | 'NOK'
  | 'DKK'

export const DEFAULT_CURRENCY: CurrencyCode = 'GBP'

const BY_CODE = new Map<string, CurrencyMeta>(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c]),
)

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && BY_CODE.has(value)
}

export function currencyMeta(code: CurrencyCode): CurrencyMeta {
  return BY_CODE.get(code) ?? SUPPORTED_CURRENCIES[0]
}

export function currencySymbol(code: CurrencyCode): string {
  return currencyMeta(code).symbol
}

/**
 * Best-effort currency detection from OCR text. An explicit ISO code
 * (e.g. "USD", "AED") is the strongest signal; otherwise fall back to
 * unambiguous symbols. Ambiguous symbols like "$" default to USD and "kr"
 * is only honoured when paired with a code. Returns null when unsure.
 */
export function detectCurrency(text: string): CurrencyCode | null {
  const upper = text.toUpperCase()

  // 1) Explicit ISO codes — most reliable.
  for (const { code } of SUPPORTED_CURRENCIES) {
    if (new RegExp(`\\b${code}\\b`).test(upper)) return code
  }

  // 2) Dirham textual markers (Arabic or "Dhs"/"Dirham").
  if (/\b(DHS?|DIRHAMS?)\b/.test(upper) || /د\.?\s?إ/.test(text)) return 'AED'

  // 3) Unambiguous symbols.
  if (text.includes('£')) return 'GBP'
  if (text.includes('€')) return 'EUR'
  if (text.includes('¥') || text.includes('円')) return 'JPY'

  // 4) Ambiguous "$" defaults to USD (AUD/CAD only via their ISO codes above).
  if (text.includes('$')) return 'USD'

  return null
}
