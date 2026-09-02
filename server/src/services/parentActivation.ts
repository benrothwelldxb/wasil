import prisma from './prisma.js'

/**
 * Has a parent ever actually got into the app?
 *
 * Deliberately not `welcomeSentAt`, and deliberately not `lastLoginAt` alone.
 * Sending someone a welcome email says nothing about whether they used it, and
 * plenty of parents were let in by a sign-in code read out at the gate or in a
 * class group, which no invite record ever saw. Three signals, any one of which
 * means they got in:
 *
 *   - `lastSeenAt` — stamped on any authenticated request. The best signal, but
 *     only for sessions since that column shipped.
 *   - A refresh token — they hold, or held, a live session.
 *   - A consumed LoginCode for their address — they typed a code in and it
 *     worked. This is the one that catches the parents nobody ever "invited",
 *     and it is matched by email because LoginCode predates any user link.
 *
 * Used by both the admin parents list and the activation funnel, so the number
 * on the chase list and the number in analytics can never drift apart.
 */
export interface ActivationCandidate {
  id: string
  email: string
  lastSeenAt: Date | null
}

export async function activatedParentIds(candidates: ActivationCandidate[]): Promise<Set<string>> {
  const activated = new Set<string>()
  if (candidates.length === 0) return activated

  const ids = candidates.map(c => c.id)
  const emails = candidates.map(c => c.email)

  const [tokenUsers, consumedCodes] = await Promise.all([
    prisma.refreshToken.findMany({
      where: { userId: { in: ids } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.loginCode.findMany({
      where: { consumedAt: { not: null }, email: { in: emails } },
      select: { email: true },
      distinct: ['email'],
    }),
  ])

  const tokenSet = new Set(tokenUsers.map(t => t.userId))
  const consumedEmails = new Set(consumedCodes.map(c => c.email))

  for (const c of candidates) {
    if (c.lastSeenAt != null || tokenSet.has(c.id) || consumedEmails.has(c.email)) {
      activated.add(c.id)
    }
  }
  return activated
}

/**
 * Every non-test parent in a school, split by whether they ever signed in.
 * Activation is not a column, so a status filter cannot be pushed into the
 * query — the whole roster is resolved first and the ids are then used to
 * narrow it. A school's parent roster is small enough for that to be cheap.
 */
export async function parentsBySignInStatus(schoolId: string): Promise<{
  signedIn: Set<string>
  neverSignedIn: Set<string>
}> {
  const parents = await prisma.user.findMany({
    // Test Parents never count — they would inflate the chase list with an
    // account nobody is meant to nudge.
    where: { schoolId, role: 'PARENT', isTest: false },
    select: { id: true, email: true, lastSeenAt: true },
  })
  const signedIn = await activatedParentIds(parents)
  const neverSignedIn = new Set(parents.filter(p => !signedIn.has(p.id)).map(p => p.id))
  return { signedIn, neverSignedIn }
}
