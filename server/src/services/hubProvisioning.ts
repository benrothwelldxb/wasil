// Wasil Hub SSO — resolving a verified Hub handoff token to a Connect user.
//
// Policy (locked): link-to-existing-only, never auto-create.
//   1. If a Connect user is already linked (User.hubUserId === sub) in the
//      token's school, use it.
//   2. Else, if a *pre-existing* Connect staff user in that school has a
//      matching (lowercased) email, link it (set hubUserId) and use it.
//   3. Else reject — Connect never provisions unknown users from Hub claims.
//
// School resolution is by School.hubSchoolId === sid; an unlinked school is a
// hard reject. Connect's own role stays authoritative — we only confirm the
// identity is staff-eligible (STAFF / ADMIN / SUPER_ADMIN), never rewrite it
// from Hub claims.
import type { User, Role } from '@prisma/client'
import prisma from './prisma.js'
import type { HubClaims } from './hubSso.js'

/** Roles that may enter Connect via a Hub staff handoff. */
const STAFF_ELIGIBLE_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN']

/** The token's school is not linked to any Connect school. -> `school_not_linked`. */
export class SchoolNotLinkedError extends Error {
  constructor(message = 'school_not_linked') {
    super(message)
    this.name = 'SchoolNotLinkedError'
  }
}

/** No pre-existing, staff-eligible Connect account matches. -> `no_account`. */
export class NoConnectAccountError extends Error {
  constructor(message = 'no_account') {
    super(message)
    this.name = 'NoConnectAccountError'
  }
}

/**
 * Resolve a verified Hub handoff token to the Connect user it should sign in.
 * Throws `SchoolNotLinkedError` or `NoConnectAccountError` on rejection.
 */
export async function resolveHubStaffUser(claims: HubClaims): Promise<User> {
  // --- School resolution --------------------------------------------------
  if (!claims.schoolId) {
    throw new SchoolNotLinkedError()
  }
  const school = await prisma.school.findUnique({
    where: { hubSchoolId: claims.schoolId },
  })
  if (!school) {
    throw new SchoolNotLinkedError()
  }

  // --- (1) Already linked in this school ----------------------------------
  // Scope by school so a globally-unique hubUserId can only sign into the
  // school the token was minted for.
  const linked = await prisma.user.findFirst({
    where: { hubUserId: claims.userId, schoolId: school.id },
  })
  if (linked) {
    if (!isStaffEligible(linked.role)) {
      // A linked account that is no longer staff-eligible must not sign in.
      throw new NoConnectAccountError()
    }
    return linked
  }

  // --- (2) Pre-existing staff account matched by email --------------------
  const email = claims.email.trim().toLowerCase()
  if (!email) {
    throw new NoConnectAccountError()
  }
  const candidate = await prisma.user.findFirst({
    where: {
      schoolId: school.id,
      email,
      role: { in: STAFF_ELIGIBLE_ROLES },
    },
  })
  if (!candidate) {
    // (3) No auto-provisioning of unknown users.
    throw new NoConnectAccountError()
  }
  // Guard against re-linking an account already bound to a different Hub
  // identity — that would let one Hub user hijack another's Connect account.
  if (candidate.hubUserId && candidate.hubUserId !== claims.userId) {
    throw new NoConnectAccountError()
  }

  try {
    return await prisma.user.update({
      where: { id: candidate.id },
      data: { hubUserId: claims.userId },
    })
  } catch {
    // Unique-constraint collision (another user already holds this hubUserId,
    // e.g. in another school) — refuse rather than partially link.
    throw new NoConnectAccountError()
  }
}

function isStaffEligible(role: Role): boolean {
  return STAFF_ELIGIBLE_ROLES.includes(role)
}
