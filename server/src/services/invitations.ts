import crypto from 'crypto'

// Characters for access code generation (no ambiguous: 0/O, 1/I/l)
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const DIGITS = '23456789'

/**
 * Generate an access code in ABC-123-XYZ format
 * Pattern: 3 letters - 3 digits - 3 letters
 */
export function generateAccessCode(): string {
  const part1 = Array.from({ length: 3 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join('')
  const part2 = Array.from({ length: 3 }, () => DIGITS[crypto.randomInt(DIGITS.length)]).join('')
  const part3 = Array.from({ length: 3 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join('')
  return `${part1}-${part2}-${part3}`
}

/**
 * Generate a magic token for email links
 */
export function generateMagicToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Generate a QR code data URL for the registration link
 */
export async function generateQRCode(registrationUrl: string): Promise<string> {
  // Using a simple QR code library - in production you'd use qrcode package
  // For now, return the URL that can be converted to QR on the frontend
  // or use a service like Google Charts QR API
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(registrationUrl)}`
  return qrApiUrl
}

/**
 * Check if an invitation is expired
 */
export function isInvitationExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false
  return new Date() > expiresAt
}

/**
 * Get the default expiry date (90 days from now)
 */
export function getDefaultExpiryDate(): Date {
  const date = new Date()
  date.setDate(date.getDate() + 90)
  return date
}

/**
 * Get the magic link expiry date (7 days from now)
 */
export function getMagicLinkExpiryDate(): Date {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return date
}

/**
 * Parse a CSV line handling quoted fields
 */
export function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Parse CSV content for bulk import
 * Expected format: Parent Email, Parent Name, Child Name, Class Name
 */
export interface BulkImportRow {
  parentEmail: string
  parentName: string
  childName: string
  className: string
}

export function parseCSV(content: string): BulkImportRow[] {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  // Skip header row
  const dataLines = lines.slice(1)

  return dataLines.map(line => {
    const [parentEmail, parentName, childName, className] = parseCSVLine(line)
    return {
      parentEmail: parentEmail || '',
      parentName: parentName || '',
      childName: childName || '',
      className: className || '',
    }
  }).filter(row => row.parentEmail && row.childName && row.className)
}

/**
 * Group bulk import rows by parent email
 */
export interface GroupedImport {
  parentEmail: string
  parentName: string
  children: Array<{ childName: string; className: string }>
}

export function groupByParent(rows: BulkImportRow[]): GroupedImport[] {
  const grouped = new Map<string, GroupedImport>()

  for (const row of rows) {
    const key = row.parentEmail.toLowerCase()
    if (!grouped.has(key)) {
      grouped.set(key, {
        parentEmail: row.parentEmail,
        parentName: row.parentName,
        children: [],
      })
    }
    grouped.get(key)!.children.push({
      childName: row.childName,
      className: row.className,
    })
  }

  return Array.from(grouped.values())
}
