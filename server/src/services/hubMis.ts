// Wasil Hub MIS client (Stage 2) — a tiny, self-contained port of the parts of
// `@wasil/pupils-client` that Connect actually consumes.
//
// Hub is the source of truth for pupils, staff, classes and year groups. Connect
// pulls (read-only) and upserts into its own tables (see `hubSync.ts`). That
// upstream client lives in a different pnpm workspace repo, so rather than take
// a cross-repo dependency we mirror only the DTO fields we map and the handful
// of endpoints we call.
//
// Auth is a single per-app `wsk_…` Bearer *service token* (not a user JWT).
// The token doesn't exist yet, so this module must import, typecheck and be
// mockable without it — calls that would hit the network throw a clear
// `HubServiceTokenMissingError` when it's unset.

// --- Config (env, resolved lazily per-call so tests/imports never need it) ---
function misBaseUrl(): string {
  const raw = process.env.HUB_MIS_URL || process.env.HUB_URL || 'https://hub.wasil.app'
  return raw.replace(/\/$/, '')
}
function serviceToken(): string {
  return process.env.HUB_SERVICE_TOKEN || ''
}

// --- Typed errors ------------------------------------------------------------
/** The `wsk_…` service token isn't configured — we can't call Hub's MIS API. */
export class HubServiceTokenMissingError extends Error {
  constructor(message = 'Hub service token not configured (set HUB_SERVICE_TOKEN)') {
    super(message)
    this.name = 'HubServiceTokenMissingError'
  }
}

/** Hub's MIS API returned a non-2xx response. */
export class HubMisError extends Error {
  constructor(public status: number, message: string) {
    super(`Hub MIS API ${status}: ${message}`)
    this.name = 'HubMisError'
  }
}

// --- Local DTOs — only the fields Connect maps -------------------------------
// Mirror of Hub's YearGroupDTO (subset). `ordinal` → Connect `YearGroup.order`.
export interface HubYearGroup {
  id: string
  name: string
  ordinal: number
}

// One class-teacher entry on a Hub ClassDTO. `hubUserId` is null for a teacher
// who hasn't signed into Hub yet (but `email` is still present); sync resolves
// these to Connect users to write StaffClassAssignment rows.
export interface HubClassTeacher {
  staffId: string
  hubUserId: string | null
  firstName: string
  lastName: string
  email: string | null
  role: string
}

// Mirror of Hub's ClassDTO (subset). `yearGroupId` is a *Hub* year-group id,
// resolved to a Connect YearGroup during sync. `teachers[]` carries the
// class-teacher assignments reconciled into StaffClassAssignment during sync.
export interface HubClass {
  id: string
  name: string
  yearGroupId: string
  yearGroupName: string
  teachers: HubClassTeacher[]
}

// Mirror of Hub's PupilDTO (subset). Note: Hub's v1 MIS pupil surface carries
// no allergy/medical/UPN fields, so those Connect columns are never written
// from a sync (see hubSync mapping notes).
export interface HubPupil {
  id: string
  misId: string | null   // school MIS Student ID / UPN — maps to Connect Student.externalId
  firstName: string
  lastName: string
  className: string | null
  yearGroupName: string | null
}

// Mirror of Hub's StaffDTO (subset). `hubUserId` is null until the staff member
// accepts their Hub invite; `globalRoles` seeds a brand-new Connect user's role
// only (never re-maps an existing user).
export interface HubStaff {
  id: string
  firstName: string
  lastName: string
  email: string | null
  jobTitle: string | null
  hubUserId: string | null
  globalRoles: string[]
  isInviteAccepted: boolean
}

// Mirror of Hub's GuardianDTO (subset). A guardian is a parent/carer linked to
// one or more pupils. `email` is null for a guardian Hub holds no address for —
// such a guardian can't be provisioned as a Connect login (User.email is
// required + unique) and is skipped by the sync. Each `pupils[]` entry's
// `pupilId` is a *Hub* pupil id (maps to Connect `Student.hubPupilId`).
export interface HubGuardianPupilLink {
  pupilId: string
  relationship: string
  isPrimary: boolean
}
export interface HubGuardian {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  pupils: HubGuardianPupilLink[]
}

// Mirror of Hub's ILSA DTO (subset). An ILSA is a 1:1 Learning Support Assistant
// engaged by a single pupil's parent — Hub owns the identity and the ILSA↔pupil
// link. `id` is the Hub user id (correlates to `User.hubUserId`); `pupilId` is a
// Hub pupil id (correlates to `Student.hubPupilId`) — the ONE pupil this ILSA is
// scoped to. `active` is false once Hub unlinks/deactivates the ILSA; Connect
// mirrors that into `IlsaLink.active` to cut off messaging + parent visibility.
// `email` is null for an ILSA Hub holds no address for — such an ILSA can't back
// a Connect login and is skipped by the sync (same rule as guardians/staff).
export interface HubIlsa {
  id: string            // Hub user id → Connect User.hubUserId
  firstName: string
  lastName: string
  email: string | null
  pupilId: string       // Hub pupil id → Connect Student.hubPupilId (the one pupil)
  active: boolean
}

// Mirror of Hub's TermDTO (subset) — an academic term's boundaries. Connect
// mirrors each into two read-only TermDate rows (a "term-start" + a "term-end").
// `startDate`/`endDate` are `YYYY-MM-DD`; `name`/`academicYear` are returned
// as-stored by Hub (e.g. "Autumn Term" / "2026/27").
export interface HubTerm {
  id: string
  name: string
  academicYear: string
  startDate: string
  endDate: string
  isCurrent: boolean
}

// Hub's calendar STRUCTURE (distinct from /terms): the academic year with terms
// and, within each term, the teaching half-terms. The gap between two half-terms
// is a half-term break — so half-terms give finer "is school running this week"
// resolution than whole terms. Dates are YYYY-MM-DD. (snake_case: this is the
// raw /calendar/structure shape, kept verbatim.)
export interface HubHalfTerm {
  id: string
  name: string
  starts_on: string
  ends_on: string
}
export interface HubStructureTerm {
  id: string
  name: string
  starts_on: string
  ends_on: string
  half_terms?: HubHalfTerm[]
}
export interface HubCalendarStructure {
  academic_year: { id: string; name: string; starts_on: string; ends_on: string }
  terms: HubStructureTerm[]
}

// Mirror of Hub's SyncStatusDTO (subset) — the polling freshness signal.
export interface HubSyncStatus {
  schoolId: string
  lastChangedAt: string | null
}

// --- Timetable DTOs (subset of Hub's EffectiveBlockDTO / effective-day shape) -
// Only the fields Connect's "today your child has …" helper actually reads.
// The full Hub block carries teachers/room/week internals we deliberately drop.
export interface HubTimetableSubject {
  id: string
  name: string
  color: string | null
  isStatutory: boolean
}
/** A teacher on a block. Hub returns more (id, email) but Connect only reads the
 * name for the parent-facing weekly timetable. */
export interface HubTimetableTeacher {
  firstName: string
  lastName: string
}
/** A room on a block. Hub returns this as an object ({ id, name, kind }); older
 * builds documented it as a bare string. Accept both so a shape change on either
 * side can't render an object into the parent app (React #31). */
export interface HubTimetableRoom {
  id?: string
  name: string
  kind?: string
}
export interface HubTimetableBlock {
  /** Stable per-block id (used as a React key by the weekly-timetable view). */
  id: string
  start: string
  end: string
  label: string
  /** null for a non-subject block (e.g. a break). */
  subject: HubTimetableSubject | null
  /** The primary teacher for the block, or null when Hub has none. */
  teacher: HubTimetableTeacher | null
  /** All teachers on the block (may be empty). */
  teachers: HubTimetableTeacher[]
  /** The room, or null when unassigned. Hub sends an object; a bare string is
   * tolerated. Normalise to a name before rendering (see toChildBlock). */
  room: HubTimetableRoom | string | null
  /** A/B-week tag as Hub folds it, e.g. "ALL". */
  week: string
  /** Specialist items (Swimming, PE) — Connect flags these for kit. */
  specialist: boolean
  block_type: string
}
export interface HubClassDay {
  version_id: string
  state_hash: string | null
  date: string
  day: number
  week_label: 'A' | 'B' | null
  blocks: HubTimetableBlock[]
}

// --- Fetch wrapper -----------------------------------------------------------
async function call<T>(path: string): Promise<T> {
  const token = serviceToken()
  if (!token) throw new HubServiceTokenMissingError()

  const res = await fetch(`${misBaseUrl()}/api/v1${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HubMisError(res.status, body || res.statusText)
  }
  return (await res.json()) as T
}

/** Like `call`, but a 404 resolves to `null` instead of throwing. Hub returns
 * `404 {"error":"no published timetable"}` for a class that simply has no live
 * timetable — an expected, non-error state the caller treats as "no items". */
async function callAllow404<T>(path: string): Promise<T | null> {
  const token = serviceToken()
  if (!token) throw new HubServiceTokenMissingError()

  const res = await fetch(`${misBaseUrl()}/api/v1${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HubMisError(res.status, body || res.statusText)
  }
  return (await res.json()) as T
}

// --- Endpoints (read-only) ---------------------------------------------------
/** Year groups for a Hub school's current academic year. */
export async function listYearGroups(hubSchoolId: string): Promise<HubYearGroup[]> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  const { yearGroups } = await call<{ yearGroups: HubYearGroup[] }>(
    `/year-groups?${params.toString()}`,
  )
  return yearGroups
}

/** Classes for a Hub school. */
export async function listClasses(hubSchoolId: string): Promise<HubClass[]> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  const { classes } = await call<{ classes: HubClass[] }>(`/classes?${params.toString()}`)
  return classes
}

/** Pupils for a Hub school, optionally scoped to one Hub class id. Sync fetches
 * per class so every returned pupil ties to a known Hub class (the PupilDTO
 * itself carries only the class *name*, not its id). */
export async function listPupils(
  hubSchoolId: string,
  opts: { classId?: string } = {},
): Promise<HubPupil[]> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  if (opts.classId) params.set('classId', opts.classId)
  const { pupils } = await call<{ pupils: HubPupil[] }>(`/pupils?${params.toString()}`)
  return pupils
}

/** Academic terms for a Hub school (its term calendar). Connect mirrors each
 * into a read-only pair of TermDate rows (term-start + term-end). */
export async function listTerms(hubSchoolId: string): Promise<HubTerm[]> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  const { terms } = await call<{ terms: HubTerm[] }>(`/terms?${params.toString()}`)
  return terms
}

/** The school's calendar structure (academic year → terms → half-terms). Used to
 * flag out-of-term weeks on the timetable. `academic_year_id` is omitted so Hub
 * returns the current year. Permitted by the calendar:read:guardian scope. */
export async function getCalendarStructure(hubSchoolId: string): Promise<HubCalendarStructure> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  return call<HubCalendarStructure>(`/calendar/structure?${params.toString()}`)
}

/** Staff for a Hub school (includes pending-invite rows: hubUserId === null). */
export async function listStaff(hubSchoolId: string): Promise<HubStaff[]> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  const { staff } = await call<{ staff: HubStaff[] }>(`/staff?${params.toString()}`)
  return staff
}

/** Guardians (parents/carers) for a Hub school, with their pupil links. Each
 * link's `pupilId` is a Hub pupil id; sync resolves it to a Connect Student via
 * `Student.hubPupilId`. Hub currently returns 0 guardians for every school, so
 * this endpoint is a no-op in practice until guardian data lands upstream. */
export async function listGuardians(hubSchoolId: string): Promise<HubGuardian[]> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  const { guardians } = await call<{ guardians: HubGuardian[] }>(
    `/guardians?${params.toString()}`,
  )
  return guardians
}

/** ILSAs (1:1 Learning Support Assistants) for a Hub school, each with the ONE
 * pupil it is scoped to. Connect provisions each as a role-ILSA user and mirrors
 * the pupil link into IlsaLink (see hubIlsaSync). Hub returns both active and
 * recently-deactivated ILSAs so Connect can flip `IlsaLink.active` on unlink
 * without losing the row. Returns [] on a Hub 404 (ILSA endpoint not deployed to
 * this school yet) so Connect is dormant-safe until the Hub slice lands. */
export async function listIlsas(hubSchoolId: string): Promise<HubIlsa[]> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  const body = await callAllow404<{ ilsas: HubIlsa[] }>(`/ilsas?${params.toString()}`)
  return body?.ilsas ?? []
}

/** When did each MIS entity-type last change for this school? Polling fallback
 * for the "stale data" banner (see INTEGRATION.md → Data freshness). */
export async function getSyncStatus(hubSchoolId: string): Promise<HubSyncStatus> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  return call<HubSyncStatus>(`/sync-status?${params.toString()}`)
}

/** One class's *effective* (folded, published) timetable for a single day.
 * Returns `null` when the school has no published timetable that covers the
 * date (Hub 404 "no published timetable"). `date` is `YYYY-MM-DD`. Approach B:
 * specialist subjects are timetabled per class, so we read per class (not per
 * guardian) and share the result across that class's parents via the cache. */
export async function getClassDay(
  hubSchoolId: string,
  hubClassId: string,
  date: string,
): Promise<HubClassDay | null> {
  const params = new URLSearchParams({ schoolId: hubSchoolId, date, class_id: hubClassId })
  return callAllow404<HubClassDay>(`/timetable/effective/day?${params.toString()}`)
}
