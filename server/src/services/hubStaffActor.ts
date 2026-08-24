// Hub-confirmed staff membership for the partner (Desk) API.
//
// Connect only holds a `User` row for staff it has seen — someone provisioned by
// a roster sync, or matched by email on a Hub SSO handoff. NON-TEACHING staff
// (reception, office) frequently miss both paths: they may post-date the last
// sync, or already exist as a PARENT-role account (a member of staff who is also
// a guardian at the school — the guardian pass deliberately never rewrites a
// role). Either way the partner inbox used to 403 them, which Desk renders as
// "no class list available".
//
// Per ADR 0004 the partner surface TRUSTS Desk's scoping and validates only
// SCHOOL MEMBERSHIP — not the caller's role. So when the local lookup misses, we
// ask the authority: Hub. If Hub lists this `hubUserId` as staff at a Hub-linked
// school, they are authorised as a staff actor for that school, and we link (or
// create) the Connect user that backs their threads.
//
// Two invariants this must never break:
//   * An ILSA is NEVER a staff actor (ADR 0006). Hub's staff list and its ILSA
//     list are distinct, and we additionally hard-refuse any local ILSA row.
//   * We never REWRITE an existing user's Connect role. A staff-member-who-is-
//     also-a-parent stays PARENT (keeping their own child's parent access) and
//     is authorised on the strength of Hub's membership answer alone.
//
// Cost control: Hub's per-school staff list is cached in-process (5 min, plus a
// 1 min backoff after a failure), so a Desk poll for an unknown id costs no
// network call.
import type { Role } from '@prisma/client'
import prisma from './prisma.js'
import { listStaff, type HubStaff } from './hubMis.js'

/** Shaped exactly like partner.ts's `StaffActor`. */
export interface HubStaffActor {
  id: string
  role: string
  schoolId: string
  name: string
}

const STAFF_TTL_MS = 5 * 60_000
const FAILURE_BACKOFF_MS = 60_000

const staffCache = new Map<string, { at: number; staff: HubStaff[] }>()
const staffFailures = new Map<string, number>()
const inFlight = new Map<string, Promise<HubStaff[]>>()

/** Hub's staff list for one school — cached, and de-duplicated across the
 * concurrent Desk polls that all miss at the same moment. */
async function hubStaffFor(hubSchoolId: string): Promise<HubStaff[]> {
  const now = Date.now()
  const hit = staffCache.get(hubSchoolId)
  if (hit && now - hit.at < STAFF_TTL_MS) return hit.staff

  const failedAt = staffFailures.get(hubSchoolId)
  if (failedAt && now - failedAt < FAILURE_BACKOFF_MS) {
    // Hub is unhappy — don't retry on every request; fall back to "not staff".
    return []
  }

  const flying = inFlight.get(hubSchoolId)
  if (flying) return flying

  const pending = listStaff(hubSchoolId)
    .then((staff) => {
      staffCache.set(hubSchoolId, { at: Date.now(), staff })
      staffFailures.delete(hubSchoolId)
      return staff
    })
    .catch((err) => {
      staffFailures.set(hubSchoolId, Date.now())
      throw err
    })
    .finally(() => inFlight.delete(hubSchoolId))

  inFlight.set(hubSchoolId, pending)
  return pending
}

/** Test seam — drop the cached staff lists (also used after a roster sync). */
export function clearHubStaffCache(): void {
  staffCache.clear()
  staffFailures.clear()
  inFlight.clear()
}

/** The Hub-linked schools to ask about. `hint` is a Hub school id OR a Connect
 * school id (Desk sends either); without one we ask every linked school — in
 * practice one, and each answer is cached. */
async function candidateSchools(hint?: string | null): Promise<{ id: string; hubSchoolId: string }[]> {
  if (hint) {
    const school = await prisma.school.findFirst({
      where: { OR: [{ hubSchoolId: hint }, { id: hint }] },
      select: { id: true, hubSchoolId: true },
    })
    return school?.hubSchoolId ? [{ id: school.id, hubSchoolId: school.hubSchoolId }] : []
  }
  const schools = await prisma.school.findMany({
    where: { hubSchoolId: { not: null } },
    select: { id: true, hubSchoolId: true },
  })
  return schools.flatMap((s) => (s.hubSchoolId ? [{ id: s.id, hubSchoolId: s.hubSchoolId }] : []))
}

/** Hub `globalRoles` → a Connect role, for a BRAND-NEW user only. Mirrors
 * `mapGlobalRolesToConnectRole` in hubSync.ts (same contract, kept local so the
 * request path doesn't pull in the whole sync graph). */
function mapGlobalRolesToConnectRole(globalRoles: string[]): Role {
  if (globalRoles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN'
  if (globalRoles.includes('ORG_ADMIN') || globalRoles.includes('SCHOOL_ADMIN')) return 'ADMIN'
  return 'STAFF'
}

/**
 * Back a Hub-confirmed staff member with a Connect user, mirroring
 * `hubSync.upsertStaff`'s discipline: link by Hub id → else by email (role
 * untouched) → else create. Returns null when we can't safely back them (an
 * ILSA row, an email already bound to a different Hub identity, or no email at
 * all — `User.email` is required + unique, so there's nothing to create).
 */
async function backingUser(
  s: HubStaff,
  hubUserId: string,
  schoolId: string,
): Promise<HubStaffActor | null> {
  // (1) A Connect row already carries this Hub identity — it just wasn't
  // staff-eligible (e.g. a PARENT-role member of staff). Authorise as-is;
  // NEVER rewrite the role.
  const linked = await prisma.user.findFirst({
    where: { hubUserId },
    select: { id: true, role: true, schoolId: true, name: true },
  })
  if (linked) {
    if (linked.role === 'ILSA') return null
    return linked
  }

  const email = s.email?.trim().toLowerCase() || null
  const name = `${s.firstName} ${s.lastName}`.trim()

  // (2) A pre-existing account in this school, matched by email. Claim the Hub
  // identity only if it's free — never re-point one user's link at another Hub
  // account — and, again, leave `role` alone.
  if (email) {
    const candidate = await prisma.user.findFirst({
      where: { schoolId, email },
      select: { id: true, role: true, schoolId: true, name: true, hubUserId: true },
    })
    if (candidate) {
      if (candidate.role === 'ILSA') return null
      if (candidate.hubUserId && candidate.hubUserId !== hubUserId) return null
      if (!candidate.hubUserId) {
        await prisma.user.update({
          where: { id: candidate.id },
          data: { hubUserId, position: s.jobTitle ?? undefined },
        })
      }
      return { id: candidate.id, role: candidate.role, schoolId: candidate.schoolId, name: candidate.name }
    }
  }

  if (!email) {
    console.warn(`[hubStaffActor] Hub staff ${hubUserId} has no email — cannot back a Connect user`)
    return null
  }

  // (3) Brand-new. This is the ONLY place a role is assigned, and it's the same
  // mapping a roster sync would have made.
  try {
    const created = await prisma.user.create({
      data: {
        email,
        name,
        role: mapGlobalRolesToConnectRole(s.globalRoles ?? []),
        schoolId,
        position: s.jobTitle ?? undefined,
        hubUserId,
      },
      select: { id: true, role: true, schoolId: true, name: true },
    })
    console.log(`[hubStaffActor] provisioned Connect user ${created.id} for Hub staff ${hubUserId}`)
    return created
  } catch {
    // Lost a race (or a cross-school unique collision) — re-read rather than
    // partially provision.
    const raced = await prisma.user.findFirst({
      where: { hubUserId },
      select: { id: true, role: true, schoolId: true, name: true },
    })
    return raced && raced.role !== 'ILSA' ? raced : null
  }
}

/**
 * Authorise a Hub user id that Connect has no staff-eligible record for, by
 * asking Hub whether they are staff at a Hub-linked school. Returns the staff
 * actor to use, or null (→ the caller's existing 403).
 *
 * Never throws: Hub being unreachable / unconfigured degrades to "not staff",
 * exactly the behaviour that existed before this fallback.
 */
export async function resolveHubStaffMembership(
  hubUserId: string,
  schoolHint?: string | null,
): Promise<HubStaffActor | null> {
  if (!hubUserId) return null
  try {
    const schools = await candidateSchools(schoolHint)
    for (const school of schools) {
      let staff: HubStaff[]
      try {
        staff = await hubStaffFor(school.hubSchoolId)
      } catch (err) {
        console.error(`[hubStaffActor] Hub staff lookup failed for school ${school.id}:`, err)
        continue
      }
      const match = staff.find((s) => s.hubUserId === hubUserId)
      if (!match) continue
      return await backingUser(match, hubUserId, school.id)
    }
    // Diagnosable in one log line: Hub itself doesn't list this id as staff at
    // any linked school, so the 403 is upstream data, not Connect's gate.
    console.warn(`[hubStaffActor] ${hubUserId} is not Hub staff at any linked school (checked ${schools.length})`)
    return null
  } catch (err) {
    console.error('[hubStaffActor] staff membership check failed:', err)
    return null
  }
}
