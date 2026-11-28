import prisma from './prisma.js'

/**
 * "Are your contact details up to date?" — when to ask, and what an answer does.
 *
 * WHEN. A school sets School.contactConfirmDays; 0 turns the prompt off for
 * everyone. Otherwise:
 *   • never answered                → ask now
 *   • no number the school can ring → ask every NON_UAE_DAYS. The office cannot
 *     call a number outside the UAE, so a parent with only a foreign number
 *     (or none) is the family the school can't reach in an emergency.
 *   • a UAE number                  → ask once a term: due when their last
 *     answer is older than the start of the current term (TermDate rows of type
 *     "term-start"). A school with no term dates falls back to every
 *     contactConfirmDays days.
 *
 * WHAT AN ANSWER DOES. Hub, and the MIS behind it, hold the family's details,
 * and Connect cannot write to either. A change is therefore a
 * ContactChangeRequest the office exports as a CSV for IT. A new phone number
 * is used by Connect at once; a new email is only requested, because the email
 * is the parent's sign-in.
 */
export const NON_UAE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

/** Digits only, with an international prefix written as its digits:
 *  "+971 50 123 4567", "00971501234567" and "0501234567" all → "971501234567".
 *  A UAE local number (leading 0, 9–10 digits) is put in international form so
 *  the two spellings of one number compare equal. */
export function canonicalPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (raw.trim().startsWith('00') || digits.startsWith('00')) digits = digits.replace(/^00/, '')
  else if (!raw.trim().startsWith('+') && /^0\d{8,9}$/.test(digits)) digits = '971' + digits.slice(1)
  return digits
}

/** Can the school ring this from the UAE as a local call? A UAE number in any
 *  of its usual spellings. Missing → false. */
export function isUaePhone(raw: string | null | undefined): boolean {
  const c = canonicalPhone(raw)
  return !!c && c.startsWith('971') && c.length >= 11 && c.length <= 12
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = canonicalPhone(a)
  return !!x && x === canonicalPhone(b)
}

export type PromptReason = 'never' | 'no_uae_number' | 'new_term' | 'interval'

export function promptDue(args: {
  now: Date
  intervalDays: number
  lastConfirmedAt: Date | null
  phone: string | null
  /** Start of the term we are in now, if the school has term dates. */
  currentTermStart: Date | null
}): PromptReason | null {
  const { now, intervalDays, lastConfirmedAt, phone, currentTermStart } = args
  if (intervalDays <= 0) return null
  if (!lastConfirmedAt) return 'never'
  const since = now.getTime() - lastConfirmedAt.getTime()
  if (!isUaePhone(phone)) return since > NON_UAE_DAYS * DAY_MS ? 'no_uae_number' : null
  if (currentTermStart) return lastConfirmedAt < currentTermStart ? 'new_term' : null
  return since > intervalDays * DAY_MS ? 'interval' : null
}

export async function currentTermStart(schoolId: string, now = new Date()): Promise<Date | null> {
  const row = await prisma.termDate.findFirst({
    where: { schoolId, type: 'term-start', date: { lte: now } },
    orderBy: { date: 'desc' },
    select: { date: true },
  })
  return row?.date ?? null
}

export type ContactField = 'PHONE' | 'EMAIL'

/**
 * Record (or update) the parent's open request for a field. One open row per
 * (user, field): a second correction replaces newValue and keeps oldValue,
 * which is what the school's records still hold. Changing it back to what the
 * school already has withdraws the request — there is nothing left to do.
 */
export async function requestContactChange(args: {
  schoolId: string
  userId: string
  field: ContactField
  schoolValue: string | null
  newValue: string
}): Promise<void> {
  const { schoolId, userId, field, schoolValue, newValue } = args
  const open = await prisma.contactChangeRequest.findFirst({
    where: { userId, field, resolvedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  const recordsHold = open ? open.oldValue : schoolValue
  const unchanged = field === 'PHONE'
    ? samePhone(recordsHold, newValue)
    : (recordsHold ?? '').toLowerCase() === newValue.toLowerCase()

  if (open) {
    if (unchanged) await prisma.contactChangeRequest.delete({ where: { id: open.id } })
    else await prisma.contactChangeRequest.update({ where: { id: open.id }, data: { newValue, exportedAt: null } })
    return
  }
  if (unchanged) return
  await prisma.contactChangeRequest.create({
    data: { schoolId, userId, field, oldValue: schoolValue, newValue },
  })
}

type OpenRequest = { id: string; field: string; newValue: string }

/** Open requests for a school, by user — loaded once per Hub sync. */
export async function openRequestsByUser(schoolId: string): Promise<Map<string, OpenRequest[]>> {
  const rows = await prisma.contactChangeRequest.findMany({
    where: { schoolId, resolvedAt: null },
    select: { id: true, userId: true, field: true, newValue: true },
  })
  const map = new Map<string, OpenRequest[]>()
  for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r])
  return map
}

/**
 * The Hub sync meeting a parent who has asked for a change.
 *
 * Returns the phone the sync should write. With an open PHONE request and Hub
 * still on the old number, that is `undefined` — keep the parent's — because
 * writing Hub's would quietly undo the correction they just made, which is
 * what used to happen. Once Hub holds the new value the request closes itself
 * and Hub's spelling is written. An EMAIL request closes the same way; the
 * email itself is handled by the sync's own email rules.
 */
export async function reconcileWithHub(
  open: OpenRequest[] | undefined,
  hub: { phone: string | null; email: string | null },
): Promise<{ phone: string | undefined }> {
  let phone = hub.phone ?? undefined
  for (const r of open ?? []) {
    const caughtUp = r.field === 'PHONE'
      ? samePhone(hub.phone, r.newValue)
      : !!hub.email && hub.email.trim().toLowerCase() === r.newValue.toLowerCase()
    if (caughtUp) {
      await prisma.contactChangeRequest.update({
        where: { id: r.id },
        data: { resolvedAt: new Date(), resolvedBy: 'hub' },
      })
    } else if (r.field === 'PHONE') {
      phone = undefined
    }
  }
  return { phone }
}
