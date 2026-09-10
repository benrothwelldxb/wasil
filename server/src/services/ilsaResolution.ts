import prisma from './prisma.js'

/**
 * Can this Hub user id act as an ILSA, and if not, why not.
 *
 * Two callers, deliberately: the partner routes, which need the actor, and the
 * ILSA sync, which needs to check that the thing it just did actually worked.
 *
 * That second caller is the point. The sync reported every STEP it took —
 * fetched, matched, linked, role checked, id claimed — and never once asked
 * whether the person could now message. Six counters were added in one day,
 * each one finding a fault the previous one had hidden, and none of them would
 * have been needed if the sync had simply verified its own outcome. A summary
 * of steps describes the health of a loop; it says nothing about whether the
 * loop achieved anything.
 */
export type IlsaResolution =
  | { ok: true; actor: { id: string; schoolId: string; name: string; studentId: string; hubPupilId: string } }
  /** No Connect user holds this hubUserId at all. */
  | { ok: false; reason: 'no_user' }
  /** A user holds it, but under a role that cannot act as an ILSA. */
  | { ok: false; reason: 'wrong_role'; role: string }
  /** The user is right; they have no active IlsaLink to a pupil. */
  | { ok: false; reason: 'no_active_link' }

export async function resolveIlsa(hubUserId: string): Promise<IlsaResolution> {
  if (!hubUserId) return { ok: false, reason: 'no_user' }

  const u = await prisma.user.findUnique({
    where: { hubUserId },
    select: { id: true, role: true, schoolId: true, name: true },
  })
  if (!u) return { ok: false, reason: 'no_user' }
  if (u.role !== 'ILSA') return { ok: false, reason: 'wrong_role', role: u.role }

  // v1 has exactly one link per ILSA; if several ever exist we take the first
  // active one.
  const link = await prisma.ilsaLink.findFirst({
    where: { userId: u.id, active: true },
    select: { studentId: true, hubPupilId: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!link) return { ok: false, reason: 'no_active_link' }

  return {
    ok: true,
    actor: { id: u.id, schoolId: u.schoolId, name: u.name, studentId: link.studentId, hubPupilId: link.hubPupilId },
  }
}

/** A sentence for a sync banner, naming what is actually wrong. */
export function describeIlsaFailure(r: Extract<IlsaResolution, { ok: false }>): string {
  if (r.reason === 'no_user') return 'no Connect account holds this Hub id'
  if (r.reason === 'wrong_role') return `account role is ${r.role}, not ILSA`
  return 'no active pupil link'
}
