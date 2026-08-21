// Wasil Hub ECA-term sync — pull Hub's academic terms and create one Connect
// `EcaTerm` per Hub term, so the after-school-club (ECA) workflow always has a
// term to hang clubs off (the provider portal otherwise shows "no term open").
//
// Ownership split (same principle as staff roles / TermDate sync):
//   • Hub owns the term's IDENTITY — name, academic year, start/end dates.
//   • Connect owns the enrolment WORKFLOW STATE — status, registration windows,
//     and the session-time defaults. The admin configures these in Connect.
//
// So a re-sync REFRESHES identity but must NEVER clobber workflow state: it must
// not reopen, reset, or re-window a term the admin has already configured. This
// is the single most important correctness rule here.
//
// Each Hub term maps to exactly one EcaTerm, keyed on `hubTermId`, so a re-run
// updates the same row instead of duplicating it. `hubTermId` is also the
// read-only marker: the ECA routes refuse DELETE and identity-edits on such
// rows (edit the name/dates in Hub). Manual terms (hubTermId null) are never
// touched by this sync.
//
// Dormant-safe: if the school isn't Hub-linked this is a clean no-op. The MIS
// client throws HubServiceTokenMissingError when the token is unset; the caller
// (hubSync) wraps this in try/catch so a failure can never break the roster sync.

import prisma from './prisma.js'
import { listTerms } from './hubMis.js'

export interface EcaTermSyncSummary {
  /** True when nothing ran (dormant): the school isn't Hub-linked. */
  skipped: boolean
  /** EcaTerms created (a Hub term we hadn't seen before). */
  created: number
  /** EcaTerms whose Hub-owned identity was refreshed (name/dates/etc.). */
  updated: number
  /** Empty Hub-sourced EcaTerms deleted because Hub dropped their term. */
  pruned: number
  /** Hub-dropped terms left in place because they already have activities —
   * deleting them would destroy real club data, so we keep (and count) them. */
  prunedSkippedNonEmpty: number
}

/**
 * Pull the Hub academic terms for one Connect school and mirror them into
 * EcaTerm. Idempotent, keyed on `hubTermId`. No-op (skipped) when the school
 * isn't Hub-linked. Never touches manual terms (hubTermId null), and on a
 * re-sync only ever refreshes Hub-owned identity — never Connect workflow state.
 */
export async function syncEcaTerms(connectSchoolId: string): Promise<EcaTermSyncSummary> {
  const school = await prisma.school.findUnique({ where: { id: connectSchoolId } })
  if (!school || !school.hubSchoolId) {
    return { skipped: true, created: 0, updated: 0, pruned: 0, prunedSkippedNonEmpty: 0 }
  }
  const schoolId = school.id

  const terms = await listTerms(school.hubSchoolId)

  // Deterministic term numbering: order Hub terms by start date and use the
  // 1-based index as Connect's `termNumber` (Term 1, 2, 3 …). Copy before
  // sorting so we never rely on Hub's array order.
  const ordered = [...terms].sort((a, b) => a.startDate.localeCompare(b.startDate))

  let created = 0
  let updated = 0
  for (let i = 0; i < ordered.length; i++) {
    const t = ordered[i]
    const termNumber = i + 1

    // Find-or-create by (schoolId, hubTermId) — no unique constraint on that
    // pair, so find-then-write for idempotency.
    const existing = await prisma.ecaTerm.findFirst({
      where: { schoolId, hubTermId: t.id },
    })

    if (existing) {
      // RE-SYNC: refresh ONLY the Hub-owned identity fields. NEVER write
      // `status`, `registrationOpens/Closes`, `allocationRun`, or the
      // session-time defaults — those are admin-owned Connect workflow state.
      await prisma.ecaTerm.update({
        where: { id: existing.id },
        data: {
          name: t.name,
          academicYear: t.academicYear,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          termNumber,
        },
      })
      updated++
    } else {
      // CREATE: a fresh DRAFT term. Registration windows and session-time
      // defaults are left unset (null) — the admin fills them in.
      await prisma.ecaTerm.create({
        data: {
          schoolId,
          hubTermId: t.id,
          name: t.name,
          academicYear: t.academicYear,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          termNumber,
          status: 'DRAFT',
        },
      })
      created++
    }
  }

  // PRUNE (safe): a term Hub dropped. Delete this school's Hub-sourced EcaTerms
  // whose hubTermId is no longer among the current Hub term ids — but ONLY when
  // the term has NO activities. A Hub term that already has clubs attached
  // carries real enrolment data, so we leave it in place (and count it) rather
  // than destroy it. Manual terms (hubTermId null) are structurally excluded.
  const currentTermIds = new Set(ordered.map((t) => t.id))
  const droppedHubTerms = await prisma.ecaTerm.findMany({
    where: {
      schoolId,
      hubTermId:
        currentTermIds.size > 0
          ? { not: null, notIn: [...currentTermIds] }
          : { not: null },
    },
    select: { id: true, _count: { select: { activities: true } } },
  })

  let pruned = 0
  let prunedSkippedNonEmpty = 0
  for (const term of droppedHubTerms) {
    if (term._count.activities > 0) {
      // Non-empty Hub-dropped term: keep it — deleting would destroy club data.
      prunedSkippedNonEmpty++
      continue
    }
    await prisma.ecaTerm.delete({ where: { id: term.id } })
    pruned++
  }

  return { skipped: false, created, updated, pruned, prunedSkippedNonEmpty }
}
