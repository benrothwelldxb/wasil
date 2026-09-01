// Wasil Hub MIS sync (Stage 2, first slice) — pull Hub's roster and upsert it
// into Connect, idempotently.
//
// Hub is the source of truth. We sync in strict dependency order so foreign
// keys always resolve:
//
//   year-groups → classes → pupils → guardians → staff
//
// Guardians are provisioned as Connect PARENT users and linked to their
// children (after pupils, so Student.hubPupilId exists to resolve links). This
// is the DATA layer only: a provisioned parent has NO password and cannot log
// in yet — login / invitation delivery (magic link or access code) is a
// documented follow-on, not built here. Hub currently returns 0 guardians, so
// the guardian step is a safe no-op (all-zero summary, no writes) until data
// lands upstream.
//
// Every upsert is keyed on the Hub id we mirror onto each Connect row
// (`hubYearGroupId` / `hubClassId` / `hubPupilId` / `hubUserId`, all `@unique`),
// so running the sync twice updates the same rows instead of duplicating them.
// Staff are the one exception: a Hub staff member may not have a Hub *user* id
// yet (pending invite), so we fall back to matching a pre-existing Connect staff
// account by email — and we never rewrite an existing user's Connect role.
//
// Field mapping (Hub DTO → Connect column) and every unmapped field are
// documented inline next to each upsert.
import type { Role } from '@prisma/client'
import prisma from './prisma.js'
import {
  listYearGroups,
  listClasses,
  listPupils,
  listStaff,
  listGuardians,
  type HubStaff,
  type HubGuardian,
  type HubClassTeacher,
} from './hubMis.js'
import { resyncCalendarForSchool, type CalendarSyncSummary } from './hubCalendarSync.js'
import { syncTermDates, type TermDateSyncSummary } from './hubTermSync.js'
import { syncEcaTerms, type EcaTermSyncSummary } from './hubEcaTermSync.js'

/** The Connect school isn't linked to a Hub school — nothing to sync. */
export class SchoolNotLinkedError extends Error {
  constructor(message = 'school_not_linked') {
    super(message)
    this.name = 'SchoolNotLinkedError'
  }
}

/** Roles that count as "staff" in Connect — an email fallback only ever links
 * one of these, and only these are eligible to have their identity re-linked. */
const STAFF_ELIGIBLE_ROLES: Role[] = ['STAFF', 'ADMIN', 'SUPER_ADMIN']

export interface SyncSummary {
  /** Year groups upserted (keyed on hubYearGroupId). */
  yearGroups: number
  /** Classes upserted (keyed on hubClassId). */
  classes: number
  /** Pupils upserted (keyed on hubPupilId). */
  pupils: number
  /** How many of those pupils Hub sent a `misId` (UPN/Student ID) for. Report
   * cards are matched to pupils by UPN in the filename, so when that column
   * looks empty this says whether Hub is sending them at all. */
  pupilMisIds: { withMisId: number; missing: number }
  /** Staff, split by whether the Connect user was created or updated/linked. */
  staff: { created: number; updated: number }
  /** Guardians provisioned as Connect PARENT users. `fetched` = how many Hub
   * returned (across all pages) — the number to compare against Hub's own
   * guardian count when parents appear to be missing; `created` = brand-new
   * accounts; `linked` = a pre-existing same-email user we attached the
   * hubGuardianId to (role untouched); `skippedNoEmail` = guardians Hub holds
   * no email for, which can't become a login and are skipped. `created +
   * linked + skippedNoEmail` always equals `fetched`, so the two ways parents
   * go missing — Hub not sending them, or Hub sending them without an email —
   * are told apart at a glance. */
  guardians: {
    fetched: number; created: number; linked: number; skippedNoEmail: number
    /** Guardians whose Connect email was re-pointed to the address Hub now
     * holds. See `upsertGuardian` for when that is allowed. */
    emailUpdated: number
    /** Address changes Hub sent that Connect declined to apply, each with the
     * reason. Surfaced rather than counted so a divergence is actionable: it
     * names the guardian and both addresses instead of leaving an admin to
     * work out why the two systems disagree. */
    emailConflicts: Array<{
      hubGuardianId: string
      from: string
      to: string
      reason: 'address_in_use' | 'account_has_login'
    }>
  }
  /** Parent↔student links. `created` counts links upserted this run;
   * `skippedNoPupil` counts guardian→pupil edges whose Hub pupil isn't synced
   * into Connect yet (no matching Student.hubPupilId). */
  parentLinks: { created: number; skippedNoPupil: number }
  /** Class-teacher assignments reconciled from each Hub class's `teachers[]`.
   * `created` = assignments added this run; `removed` = assignments dropped
   * because the teacher is no longer on Hub's list; `unresolved` = Hub teachers
   * that don't map to an existing Connect user yet (skipped, not created here —
   * they get assigned on a later sync once the staff pass creates them). */
  teacherAssignments: { created: number; removed: number; unresolved: number }
  /** Calendar resync result, folded in after the roster upserts so the manual
   * "Sync from Hub" button also refreshes events. Dormant-safe: `null` when the
   * calendar sync was skipped (not linked / no scope) or threw (a calendar
   * failure must never break the roster sync). */
  calendar?: CalendarSyncSummary | null
  /** Term-dates sync result, folded in after the roster upserts so the manual
   * "Sync from Hub" button also refreshes the term calendar. Dormant-safe:
   * `null` when the sync was skipped (school not linked) or threw (a term-date
   * failure must never break the roster sync). */
  termDates?: TermDateSyncSummary | null
  /** ECA (after-school-club) term sync result, folded in after the roster
   * upserts so the manual "Sync from Hub" button also creates an EcaTerm per
   * Hub term. Dormant-safe: `null` when the sync was skipped (school not
   * linked) or threw (an ECA-term failure must never break the roster sync). */
  ecaTerms?: EcaTermSyncSummary | null
}

/**
 * Pull the Hub roster for a Connect school and upsert it. Idempotent: safe to
 * run repeatedly. Sets `hubLastSyncedAt` and clears `hubDataStaleSince` on
 * success. Throws `SchoolNotLinkedError` if the school has no `hubSchoolId`, or
 * `HubServiceTokenMissingError` (from the MIS client) if the service token is
 * unset.
 */
export async function syncSchoolFromHub(connectSchoolId: string): Promise<SyncSummary> {
  const school = await prisma.school.findUnique({ where: { id: connectSchoolId } })
  if (!school) throw new SchoolNotLinkedError()
  if (!school.hubSchoolId) throw new SchoolNotLinkedError()
  const hubSchoolId = school.hubSchoolId
  const schoolId = school.id

  // --- 1. Year groups ------------------------------------------------------
  // Map: name → name, ordinal → order. Unmapped Hub fields: `phase` (no Connect
  // home). Keyed on hubYearGroupId. We build hubYearGroupId → Connect id so the
  // class pass can resolve its parent year group.
  const hubYearGroups = await listYearGroups(hubSchoolId)
  const yearGroupIdByHub = new Map<string, string>()
  for (const yg of hubYearGroups) {
    const row = await prisma.yearGroup.upsert({
      where: { hubYearGroupId: yg.id },
      create: { hubYearGroupId: yg.id, name: yg.name, order: yg.ordinal, schoolId },
      update: { name: yg.name, order: yg.ordinal },
    })
    yearGroupIdByHub.set(yg.id, row.id)
  }

  // --- 2. Classes ----------------------------------------------------------
  // Map: name → name, yearGroupId (Hub) → Connect YearGroup resolved above.
  // `teachers[]` is reconciled into StaffClassAssignment in a dedicated pass
  // AFTER staff are upserted (see step 6). Keyed on hubClassId.
  const hubClasses = await listClasses(hubSchoolId)
  const classIdByHub = new Map<string, string>()
  for (const cls of hubClasses) {
    const yearGroupId = yearGroupIdByHub.get(cls.yearGroupId) ?? null
    const row = await prisma.class.upsert({
      where: { hubClassId: cls.id },
      create: { hubClassId: cls.id, name: cls.name, schoolId, yearGroupId },
      update: { name: cls.name, yearGroupId },
    })
    classIdByHub.set(cls.id, row.id)
  }

  // --- 3. Pupils -----------------------------------------------------------
  // Fetched per Hub class so each pupil ties to a known Hub class id (the
  // PupilDTO carries only the class *name*). Connect's Student.classId is
  // required, so pupils with no class assignment can't be mirrored and are
  // simply not returned by the per-class fetch.
  // Map: firstName → firstName, lastName → lastName, class → resolved Connect
  // class. Unmapped Hub fields: preferredName, senStatus, dateOfBirth, gender,
  // religion, houseName, arabicLanguage, termOfBirth, guardians (no Connect
  // home). `misId` → `externalId` (the school MIS Student ID / UPN). Connect-owned
  // fields NOT touched by sync: allergies, medicalNotes, photoUrl. Keyed on
  // hubPupilId.
  let pupils = 0
  // How many pupils Hub actually sent a `misId` for. The UPN is what report-card
  // uploads match filenames against, so an empty column is indistinguishable
  // from a broken importer unless the sync says which it was.
  const misIds = { withMisId: 0, missing: 0 }
  // hubPupilId → Connect Student id, so the guardian pass can resolve each
  // guardian→pupil edge to a real Student without re-querying.
  const studentIdByHubPupil = new Map<string, string>()
  for (const cls of hubClasses) {
    const classId = classIdByHub.get(cls.id)
    if (!classId) continue
    const hubPupils = await listPupils(hubSchoolId, { classId: cls.id })
    for (const p of hubPupils) {
      const misId = p.misId?.trim() || null
      if (misId) misIds.withMisId++
      else misIds.missing++
      const row = await prisma.student.upsert({
        where: { hubPupilId: p.id },
        create: {
          hubPupilId: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          externalId: misId,
          schoolId,
          classId,
        },
        update: {
          firstName: p.firstName,
          lastName: p.lastName,
          // Only WRITE a UPN, never erase one. Hub sending no misId means Hub
          // doesn't know it — not that Connect's is wrong. The previous
          // `misId ?? null` wiped a hand-entered UPN on every sync, which is
          // also how a working report-card match could stop working overnight.
          ...(misId ? { externalId: misId } : {}),
          classId,
        },
      })
      studentIdByHubPupil.set(p.id, row.id)
      pupils++
    }
  }

  // --- 4. Guardians → parent accounts + links ------------------------------
  // Provision each Hub guardian as a Connect PARENT user and link it to its
  // children. Runs after pupils so every Student.hubPupilId already exists to
  // resolve links. Idempotent (keyed on hubGuardianId + the ParentStudentLink
  // unique). Hub pages this feed — `listGuardians` walks every page — and the
  // summary reports `fetched` alongside the outcomes so a short roster is
  // attributable to Hub's data rather than to this pass.
  const hubGuardians = await listGuardians(hubSchoolId)
  const guardianSummary: SyncSummary['guardians'] = {
    fetched: hubGuardians.length, created: 0, linked: 0, skippedNoEmail: 0,
    emailUpdated: 0, emailConflicts: [],
  }
  const parentLinkSummary = { created: 0, skippedNoPupil: 0 }
  for (const g of hubGuardians) {
    const userId = await upsertGuardian(g, schoolId, guardianSummary)
    if (!userId) continue // no-email guardian: can't be a login, already counted
    for (const link of g.pupils) {
      const studentId = studentIdByHubPupil.get(link.pupilId)
      if (!studentId) {
        // Pupil not synced into Connect yet — skip this edge, count it.
        parentLinkSummary.skippedNoPupil++
        continue
      }
      // Idempotent on the unique [userId, studentId] — re-runs never duplicate.
      await prisma.parentStudentLink.upsert({
        where: { userId_studentId: { userId, studentId } },
        create: { userId, studentId },
        update: {},
      })
      parentLinkSummary.created++
    }
  }

  // --- 5. Staff ------------------------------------------------------------
  const hubStaff = await listStaff(hubSchoolId)
  let created = 0
  let updated = 0
  for (const s of hubStaff) {
    const wasCreated = await upsertStaff(s, schoolId)
    if (wasCreated) created++
    else updated++
  }

  // --- 6. Class-teacher assignments ----------------------------------------
  // Reconcile StaffClassAssignment from each Hub class's `teachers[]`. Runs
  // AFTER the staff pass so the Connect users to resolve against already exist.
  // For every Hub-synced class (one with a hubClassId) the assignment set is
  // made AUTHORITATIVE: after resolving, the class's rows equal exactly the
  // resolved teacher set — missing rows created, stale rows removed. Classes
  // without a hubClassId (manually created) are never touched. A Hub teacher
  // that doesn't resolve to an existing Connect user is skipped and counted in
  // `unresolved` (never created here — staff creation stays in the staff pass;
  // they'll get assigned on a later sync once they exist).
  const teacherAssignments = { created: 0, removed: 0, unresolved: 0 }
  for (const cls of hubClasses) {
    const classId = classIdByHub.get(cls.id)
    if (!classId) continue

    // Resolve each Hub teacher to a Connect user id, deduped by resolved id so
    // duplicate teacher entries for the same user collapse to one assignment.
    const desiredUserIds = new Set<string>()
    for (const t of cls.teachers ?? []) {
      const userId = await resolveTeacherUserId(t, schoolId)
      if (!userId) {
        teacherAssignments.unresolved++
        continue
      }
      desiredUserIds.add(userId)
    }

    // Authoritative reconcile against the class's current assignments. Scoped
    // by classId — each class belongs to exactly one school, so this only ever
    // touches this school's rows.
    const existing = await prisma.staffClassAssignment.findMany({
      where: { classId },
      select: { id: true, userId: true },
    })
    const existingByUser = new Map(existing.map((a) => [a.userId, a.id]))

    // Create assignments present in Hub but missing in Connect. Relies on the
    // @@unique([userId, classId]) for idempotency across re-runs.
    for (const userId of desiredUserIds) {
      if (existingByUser.has(userId)) continue
      await prisma.staffClassAssignment.create({ data: { userId, classId } })
      teacherAssignments.created++
    }
    // Remove assignments no longer present in Hub's list for this class.
    for (const [userId, id] of existingByUser) {
      if (desiredUserIds.has(userId)) continue
      await prisma.staffClassAssignment.delete({ where: { id } })
      teacherAssignments.removed++
    }
  }

  // --- Mark fresh ----------------------------------------------------------
  await prisma.school.update({
    where: { id: schoolId },
    data: { hubLastSyncedAt: new Date(), hubDataStaleSince: null, lastHubSyncAt: new Date() },
  })

  // --- Calendar refresh ----------------------------------------------------
  // Fold the Hub calendar sync into the manual roster sync so the admin "Sync
  // from Hub" button also pulls (and prunes) events. Dormant-safe on its own,
  // but wrapped so a calendar failure can never fail the roster sync.
  let calendar: CalendarSyncSummary | null = null
  try {
    calendar = await resyncCalendarForSchool(schoolId)
  } catch (err) {
    console.error('[hubSync] calendar resync failed (roster sync unaffected):', err)
    calendar = null
  }

  // --- Term-dates refresh --------------------------------------------------
  // Fold the Hub term-dates sync in too, so the admin "Sync from Hub" button
  // also mirrors (and prunes) the term calendar. Wrapped so a term-date failure
  // can never fail the roster sync.
  let termDates: TermDateSyncSummary | null = null
  try {
    termDates = await syncTermDates(schoolId)
  } catch (err) {
    console.error('[hubSync] term-dates sync failed (roster sync unaffected):', err)
    termDates = null
  }

  // --- ECA-term refresh ----------------------------------------------------
  // Create/refresh an EcaTerm per Hub term so the after-school-club workflow
  // always has an open term. Wrapped so an ECA-term failure can never fail the
  // roster sync.
  let ecaTerms: EcaTermSyncSummary | null = null
  try {
    ecaTerms = await syncEcaTerms(schoolId)
  } catch (err) {
    console.error('[hubSync] ECA-term sync failed (roster sync unaffected):', err)
    ecaTerms = null
  }

  return {
    yearGroups: hubYearGroups.length,
    classes: hubClasses.length,
    pupils,
    pupilMisIds: misIds,
    staff: { created, updated },
    guardians: guardianSummary,
    parentLinks: parentLinkSummary,
    teacherAssignments,
    calendar,
    termDates,
    ecaTerms,
  }
}

/**
 * Resolve a Hub class-teacher to an existing Connect user id. Order:
 *   1. By `User.hubUserId === teacher.hubUserId` (only when Hub has a user id).
 *   2. Else (or if that misses) by case-insensitive email on a staff-eligible
 *      user in the same school.
 * Returns null when neither resolves — the caller counts it as `unresolved`
 * and never creates a user here (staff creation stays in the staff pass).
 */
async function resolveTeacherUserId(
  t: HubClassTeacher,
  schoolId: string,
): Promise<string | null> {
  if (t.hubUserId) {
    const byHub = await prisma.user.findFirst({ where: { hubUserId: t.hubUserId, schoolId } })
    if (byHub) return byHub.id
  }
  const email = t.email?.trim().toLowerCase() || null
  if (email) {
    const byEmail = await prisma.user.findFirst({
      where: { schoolId, email, role: { in: STAFF_ELIGIBLE_ROLES } },
    })
    if (byEmail) return byEmail.id
  }
  return null
}

/**
 * Has this account ever been used to sign in? `User.email` is a login
 * credential as well as a contact address, so re-pointing it on an account
 * someone actually uses would silently move where their sign-in link goes.
 *
 * Deliberately broad: a password, a recorded login, an OAuth or Hub SSO
 * identity, or a live refresh token all count. A guardian provisioned by this
 * sync has none of them — it is created with no password and cannot log in
 * until invited — so the ordinary case is still free to converge.
 */
async function accountHasLogin(user: {
  id: string
  passwordHash: string | null
  lastLoginAt: Date | null
  googleId: string | null
  microsoftId: string | null
  hubUserId: string | null
}): Promise<boolean> {
  if (user.passwordHash || user.lastLoginAt || user.googleId || user.microsoftId || user.hubUserId) {
    return true
  }
  const token = await prisma.refreshToken.findFirst({ where: { userId: user.id }, select: { id: true } })
  return !!token
}

/**
 * Decide whether to move a linked guardian's email to the address Hub now
 * holds. Returns the new address to write, or `null` to leave it alone.
 *
 * Connect stores contact address and login identity in one column, and the two
 * want different update rules. Ignoring Hub's change is not a safe default —
 * the two systems then diverge permanently, which is exactly the bug this
 * fixes — so the address does move, but only where moving it cannot cost
 * anyone their way in:
 *
 *   - Hub dropped the address entirely → keep what we have. Never erase a
 *     credential because an upstream field went blank.
 *   - The account has been used as a login → leave it, and report the conflict.
 *     Re-keying a working sign-in belongs to a person, not a nightly job.
 *   - Another Connect user already holds the address → leave it, and report.
 *     `User.email` is unique across the whole database, not per school, so this
 *     is the collision that would otherwise throw mid-sync.
 *
 * A declined change is recorded in the summary with both addresses, never
 * folded into an anonymous skip counter: a divergence nobody can see is how
 * this went unnoticed in the first place.
 */
async function resolveEmailChange(
  user: {
    id: string
    email: string
    passwordHash: string | null
    lastLoginAt: Date | null
    googleId: string | null
    microsoftId: string | null
    hubUserId: string | null
  },
  g: HubGuardian,
  incoming: string | null,
  summary: SyncSummary['guardians'],
): Promise<string | null> {
  if (!incoming || incoming === user.email.toLowerCase()) return null

  const conflict = (reason: 'address_in_use' | 'account_has_login') => {
    summary.emailConflicts.push({ hubGuardianId: g.id, from: user.email, to: incoming, reason })
    return null
  }

  if (await accountHasLogin(user)) return conflict('account_has_login')

  // Global, not school-scoped: User.email is @unique across the database.
  const taken = await prisma.user.findFirst({ where: { email: incoming }, select: { id: true } })
  if (taken && taken.id !== user.id) return conflict('address_in_use')

  summary.emailUpdated++
  return incoming
}

/**
 * Provision a single Hub guardian as a Connect PARENT user. Resolution order
 * mirrors `upsertStaff`'s "match by Hub id → else by email → else create; never
 * rewrite an existing user's role" discipline:
 *   1. Already linked — a user with this `hubGuardianId`. Refresh profile.
 *   2. Email fallback — a pre-existing user in this school with a matching
 *      (lowercased) email. Link its `hubGuardianId` (if free); role untouched —
 *      a guardian who is also staff keeps their staff role.
 *   3. Brand-new — create a PARENT user. Only here is a role assigned.
 * A guardian with no email can't be provisioned (User.email is required +
 * unique): skip it, count it in `skippedNoEmail`, never throw. Returns the
 * resolved Connect user id, or `null` when skipped (no email).
 *
 * Step 1 also refreshes the email address itself when Hub's has changed — see
 * `resolveEmailChange` for the guards. It previously refreshed only name and
 * phone, which pinned a guardian's address at whatever it was when the account
 * was first seen, and let Connect drift permanently from Hub.
 */
async function upsertGuardian(
  g: HubGuardian,
  schoolId: string,
  summary: SyncSummary['guardians'],
): Promise<string | null> {
  const name = `${g.firstName} ${g.lastName}`.trim()
  const email = g.email?.trim().toLowerCase() || null

  // (1) Already linked by Hub guardian id.
  const linked = await prisma.user.findFirst({
    where: { hubGuardianId: g.id, schoolId },
  })
  if (linked) {
    const nextEmail = await resolveEmailChange(linked, g, email, summary)
    await prisma.user.update({
      where: { id: linked.id },
      // Refresh profile; deliberately DO NOT touch `role`.
      data: { name, phone: g.phone ?? undefined, ...(nextEmail ? { email: nextEmail } : {}) },
    })
    summary.linked++
    return linked.id
  }

  // A guardian with no email can't back a login (User.email required + unique).
  if (!email) {
    summary.skippedNoEmail++
    return null
  }

  // (2) Email fallback to a pre-existing account in this school. Link the
  // guardian identity onto it WITHOUT changing its role (it may be staff).
  const candidate = await prisma.user.findFirst({ where: { schoolId, email } })
  if (candidate) {
    // Only claim the hubGuardianId if it's free — never re-point one user's
    // identity link onto another Hub guardian.
    const linkHubGuardianId =
      !candidate.hubGuardianId || candidate.hubGuardianId === g.id ? g.id : undefined
    await prisma.user.update({
      where: { id: candidate.id },
      data: {
        name,
        phone: g.phone ?? undefined,
        ...(linkHubGuardianId ? { hubGuardianId: linkHubGuardianId } : {}),
      },
    })
    summary.linked++
    return candidate.id
  }

  // (3) Brand-new PARENT account. No password — can't log in yet; login /
  // invitation delivery is a documented follow-on (see hubSync module note).
  const created = await prisma.user.create({
    data: {
      email,
      name,
      role: 'PARENT',
      schoolId,
      hubGuardianId: g.id,
      phone: g.phone ?? undefined,
    },
  })
  summary.created++
  return created.id
}

/**
 * Upsert a single Hub staff member into Connect. Resolution order:
 *   1. Linked already — a Connect user with this `hubUserId` (when Hub has one).
 *   2. Email fallback — a pre-existing staff-eligible user in this school with a
 *      matching email; link its `hubUserId` if Hub now has one. Role untouched.
 *   3. Brand-new — create a Connect user. Only here is a role assigned, mapped
 *      from Hub `globalRoles`.
 * Returns `true` when a new user was created, `false` when an existing one was
 * updated/linked (or skipped). Never rewrites an existing user's Connect role.
 */
async function upsertStaff(s: HubStaff, schoolId: string): Promise<boolean> {
  const name = `${s.firstName} ${s.lastName}`.trim()
  const email = s.email?.trim().toLowerCase() || null

  // (1) Already linked by Hub user id.
  if (s.hubUserId) {
    const linked = await prisma.user.findFirst({
      where: { hubUserId: s.hubUserId, schoolId },
    })
    if (linked) {
      await prisma.user.update({
        where: { id: linked.id },
        // Refresh profile; deliberately DO NOT touch `role`.
        data: { name, position: s.jobTitle ?? undefined },
      })
      return false
    }
  }

  // (2) Email fallback to a pre-existing staff-eligible account in this school.
  if (email) {
    const candidate = await prisma.user.findFirst({
      where: { schoolId, email, role: { in: STAFF_ELIGIBLE_ROLES } },
    })
    if (candidate) {
      // Only claim the hubUserId if it's free — never re-point one user's
      // identity link onto another Hub account.
      const linkHubUserId =
        s.hubUserId && (!candidate.hubUserId || candidate.hubUserId === s.hubUserId)
          ? s.hubUserId
          : undefined
      await prisma.user.update({
        where: { id: candidate.id },
        data: {
          name,
          position: s.jobTitle ?? undefined,
          ...(linkHubUserId ? { hubUserId: linkHubUserId } : {}),
        },
      })
      return false
    }
  }

  // (3) Brand-new. Needs an email (User.email is required + unique). Pending
  // invites with no email can't be mirrored yet — skip (counts as "updated"/
  // no-op so the summary never over-reports creations).
  if (!email) return false

  await prisma.user.create({
    data: {
      email,
      name,
      role: mapGlobalRolesToConnectRole(s.globalRoles),
      schoolId,
      position: s.jobTitle ?? undefined,
      hubUserId: s.hubUserId ?? undefined,
    },
  })
  return true
}

/** Map Hub global roles → a Connect role, for BRAND-NEW users only. Existing
 * users keep whatever Connect role they already have. */
function mapGlobalRolesToConnectRole(globalRoles: string[]): Role {
  if (globalRoles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN'
  if (globalRoles.includes('ORG_ADMIN') || globalRoles.includes('SCHOOL_ADMIN')) return 'ADMIN'
  return 'STAFF'
}
