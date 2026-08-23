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
import { listIlsas, type HubIlsa } from './hubMis.js'

export interface IlsaSyncSummary {
  /** ILSA users created brand-new (role ILSA). */
  created: number
  /** ILSA users matched to an existing account by Hub id or email (role kept). */
  linked: number
  /** ILSAs skipped because Hub holds no email (can't back a Connect login). */
  skippedNoEmail: number
  /** ILSAs whose linked Hub pupil isn't synced to a Connect Student yet. */
  skippedNoPupil: number
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
    created: 0, linked: 0, skippedNoEmail: 0, skippedNoPupil: 0,
    linksActive: 0, linksDeactivated: 0,
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { hubSchoolId: true },
  })
  if (!school?.hubSchoolId) return summary

  const hubIlsas = await listIlsas(school.hubSchoolId)

  // Ids of the IlsaLink rows we (re)affirmed active this run — everything else
  // still-active in this school is stale and gets deactivated at the end.
  const keptActiveLinkIds: string[] = []

  for (const ilsa of hubIlsas) {
    const userId = await upsertIlsaUser(ilsa, schoolId, summary)
    if (!userId) continue // no-email ILSA: can't be a login, already counted

    // Resolve the ONE linked pupil to a Connect Student (same-school).
    const student = await prisma.student.findFirst({
      where: { hubPupilId: ilsa.pupilId, schoolId },
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
          hubPupilId: ilsa.pupilId,
          active: true,
        },
        // Re-activate a previously-deactivated link if Hub re-links the ILSA.
        update: { active: true, deactivatedAt: null, hubPupilId: ilsa.pupilId },
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
  ilsa: HubIlsa,
  schoolId: string,
  summary: IlsaSyncSummary,
): Promise<string | null> {
  const name = `${ilsa.firstName} ${ilsa.lastName}`.trim()
  const email = ilsa.email?.trim().toLowerCase() || null

  // (1) Already linked by Hub user id.
  const linked = await prisma.user.findFirst({
    where: { hubUserId: ilsa.id, schoolId },
    select: { id: true },
  })
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
    select: { id: true, hubUserId: true },
  })
  if (candidate) {
    const linkHubUserId =
      !candidate.hubUserId || candidate.hubUserId === ilsa.id ? ilsa.id : undefined
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
    data: { email, name, role: 'ILSA', schoolId, hubUserId: ilsa.id },
    select: { id: true },
  })
  summary.created++
  return created.id
}
