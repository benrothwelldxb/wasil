// Eligibility-streamed lessons — showing a child the lesson they actually take.
//
// Hub lets a school tag a subject with the cohort it's for ("Shown to" = Muslim
// pupils only / Arabic A pupils only). At such a slot the timetable holds TWO
// lessons: the restricted one (Islamic, Arabic A) and the alternative everyone
// else takes (Enrichment, untagged).
//
// Hub's GUARDIAN day view resolves that per child. Connect doesn't read it: we
// read the CLASS view, because a class-day answer is shared by every parent in
// the class (one cached fetch instead of one per guardian) and because it's the
// view that carries teacher + room, which the parent timetable renders. The
// class view returns every stream unfiltered — so a parent-facing view would
// show BOTH lessons in the slot unless it resolves the slot itself.
//
// So: keep reading the class view, and apply Hub's documented per-slot rule
// here, using the child's flags read (and cached) from the guardian view.
//   1. A tagged lesson is shown only to a child who matches it.
//   2. An untagged lesson is shown to everyone NOT already placed in a tagged
//      lesson in that same slot.
//   3. A slot with no tagged lesson is shown to everyone.
// Fail-closed: an unknown or blank flag never reveals a restricted lesson — that
// child gets the alternative.
//
// Cost: nothing changes until a school actually tags a subject. Callers check
// `hasStreamedBlocks` first, so an untagged school makes zero extra Hub calls.
import prisma from './prisma.js'
import { getGuardianDay, type HubTimetableBlock, type PupilEligibility } from './hubMis.js'

/** Flags don't change day to day, so one read serves a guardian for hours. */
const ELIGIBILITY_TTL_MS = 6 * 60 * 60 * 1000

interface Entry {
  expiresAt: number
  /** hubPupilId → that pupil's flags. */
  value: Promise<Map<string, PupilEligibility>>
}
const cache = new Map<string, Entry>()

const SEP = ' '
const key = (hubSchoolId: string, guardianKey: string) => `${hubSchoolId}${SEP}${guardianKey}`

/** Test seam / manual refresh. */
export function invalidateEligibility(): void {
  cache.clear()
}

/** Does this day carry any streamed lesson at all? When false — the school
 * hasn't tagged anything — there is nothing to resolve and no reason to spend a
 * Hub call on eligibility. */
export function hasStreamedBlocks(blocks: ReadonlyArray<HubTimetableBlock>): boolean {
  return blocks.some((b) => !!b.audience)
}

/** Is this child in the cohort a tagged lesson is for? Unknown flags read as
 * false, so a restricted lesson is never revealed by accident. */
function matchesAudience(block: HubTimetableBlock, flags: PupilEligibility): boolean {
  switch (block.audience) {
    case 'ARABIC_A':
      return flags.arabicA === true
    case 'ARABIC_NON_A':
      return flags.arabicA !== true
    case 'ISLAMIC':
      return flags.muslim === true
    case 'NON_ISLAMIC':
      return flags.muslim !== true
    default:
      // Untagged (or a stream Hub adds later that we don't know): everyone.
      return true
  }
}

/**
 * Resolve one day's class blocks down to what THIS child takes.
 *
 * Pure, and safe on any input: a day with no tagged lesson comes back
 * unchanged, so this can be applied unconditionally.
 */
export function resolveBlocksForPupil(
  blocks: ReadonlyArray<HubTimetableBlock>,
  flags: PupilEligibility,
): HubTimetableBlock[] {
  if (!hasStreamedBlocks(blocks)) return [...blocks]

  // Group by time slot — the unit the rule operates on. Insertion order is
  // preserved so the resolved day keeps Hub's ordering.
  const slots = new Map<string, HubTimetableBlock[]>()
  for (const b of blocks) {
    const slot = `${b.start}${SEP}${b.end}`
    const arr = slots.get(slot)
    if (arr) arr.push(b)
    else slots.set(slot, [b])
  }

  const keep = new Set<HubTimetableBlock>()
  for (const inSlot of slots.values()) {
    const tagged = inSlot.filter((b) => !!b.audience)
    if (tagged.length === 0) {
      // (3) Nothing streamed here — a normal lesson, or a shared one.
      for (const b of inSlot) keep.add(b)
      continue
    }
    const mine = tagged.filter((b) => matchesAudience(b, flags))
    if (mine.length > 0) {
      // (1) Placed in the restricted lesson — the alternative isn't theirs.
      for (const b of mine) keep.add(b)
      continue
    }
    // (2) Not eligible: the untagged alternative beside it (Enrichment). If the
    // school tagged every lesson in the slot, this child simply has none.
    for (const b of inSlot) if (!b.audience) keep.add(b)
  }

  return blocks.filter((b) => keep.has(b))
}

/** Read (and cache) every child's flags for one guardian, keyed by Hub pupil id.
 * Rejections are evicted so a Hub blip doesn't pin an empty map for hours. */
async function eligibilityForGuardian(
  hubSchoolId: string,
  guardian: { guardianId?: string | null; guardianEmail?: string | null },
  date: string,
): Promise<Map<string, PupilEligibility>> {
  const guardianKey = guardian.guardianId || guardian.guardianEmail || ''
  const k = key(hubSchoolId, guardianKey)
  const now = Date.now()
  const hit = cache.get(k)
  if (hit && hit.expiresAt > now) return hit.value

  const value = getGuardianDay(hubSchoolId, guardian, date)
    .then((day) => {
      const byPupil = new Map<string, PupilEligibility>()
      for (const child of day?.children ?? []) {
        if (child?.pupilId && child.eligibility) byPupil.set(child.pupilId, child.eligibility)
      }
      return byPupil
    })
    .catch((err) => {
      if (cache.get(k)?.value === value) cache.delete(k)
      throw err
    })
  cache.set(k, { expiresAt: now + ELIGIBILITY_TTL_MS, value })
  return value
}

/**
 * The flags for ONE of a guardian's children, or `null` when we can't tell —
 * Hub unreachable, the guardian unknown to Hub, or no flags published for that
 * pupil. `null` means "don't resolve": the caller shows the day unfiltered,
 * exactly as it did before streaming existed. That's deliberate — hiding a
 * lesson a child does attend is a worse failure than showing both.
 */
export async function eligibilityForPupil(
  hubSchoolId: string,
  guardian: { guardianId?: string | null; guardianEmail?: string | null },
  hubPupilId: string | null,
  date: string,
): Promise<PupilEligibility | null> {
  if (!hubPupilId || (!guardian.guardianId && !guardian.guardianEmail)) return null
  try {
    const byPupil = await eligibilityForGuardian(hubSchoolId, guardian, date)
    return byPupil.get(hubPupilId) ?? null
  } catch (err) {
    console.error('[timetableEligibility] guardian day view failed (showing unresolved day):', err)
    return null
  }
}

/** The guardian identity to address Hub with, for a Connect parent user. */
export async function guardianKeyFor(
  userId: string,
): Promise<{ guardianId: string | null; guardianEmail: string | null }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { hubGuardianId: true, email: true },
  })
  return { guardianId: u?.hubGuardianId ?? null, guardianEmail: u?.email ?? null }
}
