// Wasil Hub MIS sync (Stage 2, first slice) — pull Hub's roster and upsert it
// into Connect, idempotently.
//
// Hub is the source of truth. We sync in strict dependency order so foreign
// keys always resolve:
//
//   year-groups → classes → pupils → staff
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
  type HubStaff,
} from './hubMis.js'

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
  /** Staff, split by whether the Connect user was created or updated/linked. */
  staff: { created: number; updated: number }
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
  // Unmapped Hub fields: `teachers[]` (class-teacher assignments — a documented
  // follow-on; see TODO below). Keyed on hubClassId.
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
  // home). Connect-owned fields NOT touched by sync: externalId (UPN — not on
  // Hub's v1 pupil surface), allergies, medicalNotes, photoUrl. Keyed on
  // hubPupilId.
  let pupils = 0
  for (const cls of hubClasses) {
    const classId = classIdByHub.get(cls.id)
    if (!classId) continue
    const hubPupils = await listPupils(hubSchoolId, { classId: cls.id })
    for (const p of hubPupils) {
      await prisma.student.upsert({
        where: { hubPupilId: p.id },
        create: {
          hubPupilId: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          schoolId,
          classId,
        },
        update: {
          firstName: p.firstName,
          lastName: p.lastName,
          classId,
        },
      })
      pupils++
    }
  }

  // --- 4. Staff ------------------------------------------------------------
  const hubStaff = await listStaff(hubSchoolId)
  let created = 0
  let updated = 0
  for (const s of hubStaff) {
    const wasCreated = await upsertStaff(s, schoolId)
    if (wasCreated) created++
    else updated++
  }

  // --- Mark fresh ----------------------------------------------------------
  await prisma.school.update({
    where: { id: schoolId },
    data: { hubLastSyncedAt: new Date(), hubDataStaleSince: null },
  })

  return {
    yearGroups: hubYearGroups.length,
    classes: hubClasses.length,
    pupils,
    staff: { created, updated },
  }
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
