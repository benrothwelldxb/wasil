/**
 * Pure receipt-text parsing. No dependencies on the DOM, Tesseract or the
 * store, so it can be unit-tested in isolation.
 */

/** A line item parsed from OCR text, before it gets a stable id. */
export interface ParsedItem {
  label: string
  price: number
  quantity: number
}

/**
 * Lines that describe the bill as a whole rather than an item. We're
 * ignoring totals for now, so these are dropped during parsing.
 */
const NON_ITEM = new RegExp(
  [
    'sub[-\\s]?total',
    'total',
    'balance',
    'amount\\s+due',
    'tax',
    'vat',
    'gst',
    'gratuity',
    'service\\s+charge',
    '\\btip\\b',
    'change',
    'cash',
    'card',
    'visa',
    'mastercard',
    'amex',
    'debit',
    'credit',
    'tender',
    'payment',
    'rounding',
    'discount',
    'savings',
    'thank\\s*you',
  ].join('|'),
  'i',
)

/** Trailing monetary amount, tolerating a currency symbol and , or . decimals. */
const TRAILING_PRICE = /(-?\d{1,4}[.,]\d{2})\s*$/
/** An explicit quantity prefix like "2x " or "3 x ". */
const QUANTITY_PREFIX = /^(\d{1,2})\s*[xX]\s*/

/** Strip leading currency symbols / bullets and tidy whitespace. */
function cleanLabel(raw: string): string {
  return raw
    .replace(/[•*·]+/g, ' ')
    .replace(/[£$€]/g, ' ')
    .replace(/[\s.\-:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Turn raw OCR text into candidate line items. Heuristic by design — the user
 * reviews and edits the result. Totals, taxes and payment lines are skipped.
 */
export function parseReceiptItems(text: string): ParsedItem[] {
  const items: ParsedItem[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length < 2) continue
    if (NON_ITEM.test(line)) continue

    const priceMatch = line.match(TRAILING_PRICE)
    if (!priceMatch) continue

    const price = parseFloat(priceMatch[1].replace(',', '.'))
    if (!Number.isFinite(price) || price <= 0) continue

    let rest = line.slice(0, priceMatch.index).trim()

    let quantity = 1
    const qtyMatch = rest.match(QUANTITY_PREFIX)
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10)
      if (qty > 0 && qty <= 30) {
        quantity = qty
        rest = rest.slice(qtyMatch[0].length)
      }
    }

    const label = cleanLabel(rest)
    // Need a real name; a lone number/symbol isn't a usable item.
    if (label.replace(/[^a-zA-Z]/g, '').length < 2) continue

    items.push({ label, price, quantity })
  }

  return items
}
