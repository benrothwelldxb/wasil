// Wasil Hub → Connect ILSA sync (ADR 0006).
//
// An ILSA (Learning Support Assistant) is a 1:1 assistant engaged + paid by a
// single pupil's parent — NOT a school employee. Hub owns the identity and the
// ILSA↔pupil link; Connect mirrors it into two local rows so runtime messaging
// never has to call Hub and so a Hub unlink can revoke access locally:
//   • the ILSA's Connect User (role ILSA), and
//   • an IlsaLink pinning that user to exactly ONE pupil.
//
// Provisioning mirrors `hubSync`'s guardian/staff discipline: match by Hub id →
// else by email → else create; NEVER rewrite an existing user's role. An ILSA Hub
// holds no email for can't back a Connect login (User.email is required + unique)
// and is skipped. Idempotent + dormant-safe: Hub returns [] until the ILSA
// endpoint ships, so a sync is a clean no-op until then.
//
// Lifecycle (deliverable #5): a Hub ILSA that is `active:false`, or that has
// dropped out of Hub's list entirely, has its IlsaLink flipped to `active:false`
// (+ `deactivatedAt`). That single flag cuts off messaging (resolveActor returns
// null) AND removes the parent-side contact, while the Conversation + messages
// are RETAINED for the oversight/retention window. We never delete a link.
import prisma from './prisma.js'
import { listIlsas, normaliseIlsa, type NormalisedIlsa } from './hubMis.js'

export interface IlsaSyncSummary {
  /** Set when the reconcile threw. Present so a FAILURE and an empty roster
   * cannot render the same way — reporting a crash as all-zeroes is the exact
   * absent-vs-empty trap that made this bug take two days to find. */
  failed?: true
  /** Why it failed, for the toast. Never the raw stack. */
  error?: string
  /** How many ILSAs Hub returned, before any of them were skipped. The number
   * to compare against Hub's own roster: `listIlsas` 404-tolerates, so a Hub
   * endpoint that isn't deployed for this school is indistinguishable here from
   * a school with no ILSAs — both arrive as zero. Reporting it is what lets an
   * admin tell "Hub sent none" from "we dropped them all". */
  fetched: number
  /** ILSA users created brand-new (role ILSA). */
  created: number
  /** ILSA users matched to an existing account by Hub id or email (role kept). */
  linked: number
  /** ILSAs skipped because Hub holds no email (can't back a Connect login). */
  skippedNoEmail: number
  /** ILSAs whose linked Hub pupil isn't synced to a Connect Student yet. */
  skippedNoPupil: number
  /** ILSAs Hub sent with no pupil id at all — malformed rather than pending. */
  skippedNoPupilId: number
  /** ILSAs whose Connect account already exists under a different role, so it
   * is left alone (never rewrite a role — a guardian who is also staff keeps
   * their staff role). They CANNOT be resolved as a messaging actor:
   * resolveIlsaActor requires role ILSA. Counted because the alternative is
   * reporting them as `linked`, which reads as success and is not. */
  roleConflict: number
  /** ILSAs Hub has no hubUserId for yet (null until first sign-in). They are
   * provisioned and linked, but cannot be RESOLVED as a messaging actor until a
   * later sync picks up the id — so a non-zero count here explains why an ILSA
   * who exists in Connect still can't start a conversation. */
  withoutHubUserId: number
  /** IlsaLink rows upserted active this run. */
  linksActive: number
  /** IlsaLink rows deactivated this run (Hub unlink/deactivate, or dropped). */
  linksDeactivated: number
}

/**
 * Pull the Hub ILSA roster for a Connect school and reconcile it into ILSA users
 * + IlsaLink rows. Returns a summary; safe to re-run (idempotent). No-op for a
 * school with no `hubSchoolId`.
 */
export async function syncIlsasForSchool(schoolId: string): Promise<IlsaSyncSummary> {
  const summary: IlsaSyncSummary = {
    fetched: 0, created: 0, linked: 0, skippedNoEmail: 0, skippedNoPupil: 0,
    skippedNoPupilId: 0, withoutHubUserId: 0, roleConflict: 0,
    linksActive: 0, linksDeactivated: 0,
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { hubSchoolId: true },
  })
  if (!school?.hubSchoolId) return summary

  const hubIlsas = await listIlsas(school.hubSchoolId)
  summary.fetched = hubIlsas.length

  // Ids of the IlsaLink rows we (re)affirmed active this run — everything else
  // still-active in this school is stale and gets deactivated at the end.
  const keptActiveLinkIds: string[] = []

  for (const raw of hubIlsas) {
    // Hub's shape differs from what this file was written against; resolve it
    // once, here, rather than reading raw fields in three places.
    const ilsa = normaliseIlsa(raw)

    // No pupil id at all. Previously this fell through as `undefined` and Prisma
    // rejected it on a required column, which threw and took the whole sync down
    // — so one malformed record looked exactly like Hub sending nothing.
    if (!ilsa.hubPupilId) {
      summary.skippedNoPupilId++
      continue
    }

    const userId = await upsertIlsaUser(ilsa, schoolId, summary)
    if (!userId) continue // no-email ILSA: can't be a login, already counted

    // Resolve the ONE linked pupil to a Connect Student (same-school).
    const student = await prisma.student.findFirst({
      where: { hubPupilId: ilsa.hubPupilId, schoolId },
      select: { id: true },
    })
    if (!student) {
      // Pupil not synced yet — can't link. If a link already exists (pupil later
      // removed), leave the stale-sweep below to deactivate it.
      summary.skippedNoPupil++
      continue
    }

    if (ilsa.active) {
      const link = await prisma.ilsaLink.upsert({
        where: { userId_studentId: { userId, studentId: student.id } },
        create: {
          schoolId,
          userId,
          studentId: student.id,
          hubPupilId: ilsa.hubPupilId,
          active: true,
        },
        // Re-activate a previously-deactivated link if Hub re-links the ILSA.
        update: { active: true, deactivatedAt: null, hubPupilId: ilsa.hubPupilId },
        select: { id: true },
      })
      keptActiveLinkIds.push(link.id)
      summary.linksActive++
    }
    // An inactive Hub ILSA is left for the stale-sweep to deactivate (below),
    // which also covers ILSAs that vanished from Hub's list entirely.
  }

  // Stale-sweep: deactivate every still-active IlsaLink in this school we did NOT
  // reaffirm — Hub deactivated it or dropped it. Thread history is untouched.
  const sweep = await prisma.ilsaLink.updateMany({
    where: {
      schoolId,
      active: true,
      ...(keptActiveLinkIds.length > 0 ? { id: { notIn: keptActiveLinkIds } } : {}),
    },
    data: { active: false, deactivatedAt: new Date() },
  })
  summary.linksDeactivated = sweep.count

  return summary
}

/**
 * Provision one Hub ILSA as a Connect user. Resolution order (mirrors
 * `upsertGuardian`):
 *   1. Already linked by `User.hubUserId`. Refresh name; role untouched.
 *   2. Email fallback to a pre-existing same-school account. Link `hubUserId` if
 *      free; role untouched (a person who is also staff/guardian keeps that role
 *      — least surprise; their ILSA scope still comes only from IlsaLink).
 *   3. Brand-new — create a role-ILSA user. Only here is a role assigned.
 * Returns the Connect user id, or null when skipped (no email).
 */
async function upsertIlsaUser(
  ilsa: NormalisedIlsa,
  schoolId: string,
  summary: IlsaSyncSummary,
): Promise<string | null> {
  const { name, email } = ilsa

  // Hub leaves hubUserId null until the ILSA first signs in, and that null must
  // never reach the query: `where: { hubUserId: null }` matches the first user
  // in the school who happens to have none, and would hand this ILSA someone
  // else's account. Absent means "match by email instead", not "match anyone".
  if (!ilsa.hubUserId) summary.withoutHubUserId++

  // (1) Already linked by Hub user id.
  const linked = ilsa.hubUserId
    ? await prisma.user.findFirst({
        where: { hubUserId: ilsa.hubUserId, schoolId },
        select: { id: true },
      })
    : null
  if (linked) {
    await prisma.user.update({
      where: { id: linked.id },
      data: { name }, // deliberately DO NOT touch role
    })
    summary.linked++
    return linked.id
  }

  // An ILSA with no email can't back a login (User.email required + unique).
  if (!email) {
    summary.skippedNoEmail++
    return null
  }

  // (2) Email fallback to a pre-existing account in this school.
  const candidate = await prisma.user.findFirst({
    where: { schoolId, email },
    select: { id: true, hubUserId: true, role: true },
  })
  if (candidate) {
    // An account under any other role stays under it — the same rule that keeps
    // a guardian who is also staff on their staff role. But resolveIlsaActor
    // requires role ILSA, so this person can never act as one, and counting
    // them as `linked` would report a dead end as a success.
    if (candidate.role !== 'ILSA') summary.roleConflict++
    // Claim the identity only when Hub has one and it is free — never re-point
    // an existing user's hubUserId at a different person.
    const linkHubUserId =
      ilsa.hubUserId && (!candidate.hubUserId || candidate.hubUserId === ilsa.hubUserId)
        ? ilsa.hubUserId
        : undefined
    await prisma.user.update({
      where: { id: candidate.id },
      data: { name, ...(linkHubUserId ? { hubUserId: linkHubUserId } : {}) },
    })
    summary.linked++
    return candidate.id
  }

  // (3) Brand-new role-ILSA account. No password — an ILSA never holds a Connect
  // session; they act only via the Desk partner routes keyed on hub_user_id.
  const created = await prisma.user.create({
    // hubUserId stays null when Hub has none yet: the account and its pupil link
    // are still worth creating, and a later sync fills the id in once they sign
    // in. Writing the ILSA record id here instead — which is what this did — put
    // a value in the column that no SSO subject will ever match.
    data: { email, name, role: 'ILSA', schoolId, ...(ilsa.hubUserId ? { hubUserId: ilsa.hubUserId } : {}) },
    select: { id: true },
  })
  summary.created++
  return created.id
}
