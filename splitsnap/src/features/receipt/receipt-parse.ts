/**
 * Pure receipt-text parsing. No dependencies on the DOM, Tesseract or the
 * store, so it can be unit-tested in isolation.
 *
 * Goal: pull out { item, price } lines and skip everything that isn't an
 * ordered item — totals, tax, service charge, card/payment lines, the date
 * and the receipt/order number. It's deliberately conservative: anything it
 * gets wrong the user can fix in the editable list.
 */

/** A line item parsed from OCR text, before it gets a stable id. */
export interface ParsedItem {
  label: string
  price: number
  quantity: number
}

/**
 * Bill-level / financial lines (totals, tax, tips, payment methods). Each
 * keyword is word-bounded so it doesn't clip real menu items — e.g. "cash"
 * must not match "Cashew", "card" must not match "Cardamom".
 */
const FINANCIAL = new RegExp(
  [
    '\\bsub[-\\s]?total\\b',
    '\\btotal\\b',
    '\\bbalance\\b',
    '\\b(?:amount|change)\\s+due\\b',
    '\\btax\\b',
    '\\bvat\\b',
    '\\b(?:gst|hst|pst)\\b',
    '\\bgratuity\\b',
    '\\bservice\\s+charge\\b',
    '\\btips?\\b',
    '\\btender(?:ed)?\\b',
    '\\bcash\\b',
    '\\bcard\\b',
    '\\bvisa\\b',
    '\\bmaster\\s?card\\b',
    '\\bmaestro\\b',
    '\\bamex\\b',
    '\\bdiscover\\b',
    '\\b(?:debit|credit)\\b',
    '\\bpayment\\b',
    '\\bchange\\b',
    '\\brounding\\b',
    '\\bdiscount\\b',
    '\\bsavings?\\b',
    '\\brefund\\b',
    '\\bthank\\s*you\\b',
  ].join('|'),
  'i',
)

/** A calendar date: numeric (12/03/2024, 2024-03-12, 12.03.24). */
const DATE_NUMERIC = /\b\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/
/** A date written with a month name next to a day number. */
const DATE_WORDS =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i
/** A clock time, e.g. 14:35 or 2:05 pm. */
const TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\b/i
/** An explicit "Date …" label at the start of the line. */
const DATE_LABEL = /^\s*date\b/i

/**
 * Receipt / order / table metadata, anchored to the start of the line so a
 * leading "Order"/"Table" is treated as a label rather than clipping an item.
 * Combined with the "no trailing price" guard below, this ignores lines like
 * "Table 7" or "Receipt No: 000482" while keeping real items such as
 * "Table Water 3.00".
 */
const RECEIPT_META =
  /^\s*(?:receipt|invoice|order|bill|check|cheque|ticket|trans(?:action)?|ref(?:erence)?|auth\w*|terminal|till|register|reg|table|server|cashier|clerk|operator|guests?|covers?|host|store|branch|merchant|tel(?:ephone)?|phone|fax|no|nr|#)\b/i

/** Trailing monetary amount, tolerating a currency symbol, comma/point
 * decimals and an optional single tax-code letter (e.g. "3.20 A"). */
const TRAILING_PRICE = /(-?\d{1,4}[.,]\d{2})\s*[A-Z*]?\s*$/
/** An explicit quantity prefix like "2x " or "3 x ". */
const QUANTITY_PREFIX = /^(\d{1,2})\s*[xX]\s*/

/** True if a line is metadata we should never treat as an ordered item. */
export function isIgnoredLine(line: string): boolean {
  if (
    FINANCIAL.test(line) ||
    DATE_LABEL.test(line) ||
    DATE_NUMERIC.test(line) ||
    DATE_WORDS.test(line) ||
    TIME.test(line)
  ) {
    return true
  }
  // Receipt/order/table numbers: a metadata keyword leads the line and it has
  // no priced amount (a real item like "Table Water 3.00" keeps its price).
  return RECEIPT_META.test(line) && !TRAILING_PRICE.test(line)
}

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
 * reviews and edits the result. Totals, tax, service charge, card/payment,
 * dates and receipt numbers are skipped.
 */
export function parseReceiptItems(text: string): ParsedItem[] {
  const items: ParsedItem[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length < 2) continue
    if (isIgnoredLine(line)) continue

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
