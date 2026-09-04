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
/**
 * Attendance, as Hub serves it (Hub handoff, 4 Sep 2026).
 *
 * Hub does not calculate this. A school admin uploads the MIS export — Nexquare
 * at VH — and Hub serves the number verbatim. Three distinctions the handoff is
 * explicit about, and all three are the difference between honest and not:
 *
 *   • `attendance: null` means Hub holds no figure for that pupil. The field
 *     being ABSENT means our token lacks the `pupils:attendance` scope — we
 *     were not told. Neither is 0%.
 *   • `asOf` is the date the figure DESCRIBES, not when it was uploaded, and
 *     not freshness. A figure can be asOf last term because nobody has uploaded
 *     since. It must be shown wherever the percentage is.
 *   • `percentage` is 0–100, not a fraction, and is not to be recomputed into
 *     sessions or days — that data is not here.
 */
export interface HubPupilAttendance {
  /** Percent present, 0–100. Both 0 and 100 are legitimate values. */
  percentage: number
  /** YYYY-MM-DD — the date this figure is about. */
  asOf: string
}

export interface HubPupil {
  id: string
  misId: string | null   // school MIS Student ID / UPN — maps to Connect Student.externalId
  firstName: string
  lastName: string
  className: string | null
  yearGroupName: string | null
  /** Present only once `pupils:attendance` is granted; null when Hub holds no
   *  figure for this pupil. Optional here so Connect works either way rather
   *  than depending on a deployment order. */
  attendance?: HubPupilAttendance | null
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

// Hub's ILSA DTO. An ILSA is a 1:1 Learning Support Assistant engaged by a single
// pupil's parent — Hub owns the identity and the ILSA↔pupil link. `active` is
// false once Hub unlinks or deactivates them; Connect mirrors that into
// `IlsaLink.active` to cut off messaging and parent visibility. An ILSA Hub holds
// no email for can't back a Connect login and is skipped (as for guardians/staff).
/**
 * Written against an assumed shape and wrong about three fields, which is what
 * cast-not-validated DTOs cost. Hub actually sends:
 *
 *   • `id` is the ILSA RECORD id, not a user id. The SSO subject Desk presents
 *     is `hubUserId`, a different value — matching on `id` could never resolve
 *     anyone. `hubUserId` is null until that ILSA first signs in.
 *   • `pupilIds` is an array. Reading `pupilId` gave undefined, which Prisma
 *     rejected on a required column — so the sync threw rather than returning
 *     zero, and a throw and an empty roster looked identical downstream.
 *   • `name` is one field, not `firstName` + `lastName`.
 *
 * Both spellings are accepted rather than swapping one guess for another: this
 * is an external shape nothing validates, and tolerating either costs a `??`.
 */
export interface HubIlsa {
  /** The ILSA record's own id. NOT a user id — see `hubUserId`. */
  id: string
  /** Hub user id → Connect `User.hubUserId`, and the SSO subject Desk sends.
   *  Null until the ILSA has signed in at least once, so an ILSA synced before
   *  their first sign-in cannot be resolved until a later sync picks it up. */
  hubUserId?: string | null
  name?: string
  firstName?: string
  lastName?: string
  email: string | null
  /** The pupils this ILSA is scoped to. One in practice (ADR 0006). */
  pupilIds?: string[]
  /** Older/assumed spelling, still accepted. */
  pupilId?: string
  active: boolean
}

/** Hub's ILSA as Connect needs it, with the shape differences resolved once. */
export interface NormalisedIlsa {
  hubUserId: string | null
  name: string
  email: string | null
  hubPupilId: string | null
  active: boolean
}

export function normaliseIlsa(raw: HubIlsa): NormalisedIlsa {
  const name = raw.name?.trim()
    || `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim()
    || 'Learning Support Assistant'
  return {
    // Never `raw.id` — see the note above.
    hubUserId: raw.hubUserId?.trim() || null,
    name,
    email: raw.email?.trim().toLowerCase() || null,
    hubPupilId: raw.pupilIds?.[0]?.trim() || raw.pupilId?.trim() || null,
    active: raw.active,
  }
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
  /** Which eligibility STREAM this lesson belongs to, when a school has tagged
   * its restricted subjects in Hub ("Shown to" = Muslim pupils only / Arabic A
   * pupils only). `null`/absent = everyone. The CLASS view (which Connect reads)
   * returns every stream unfiltered, so a parent-facing view must resolve each
   * slot itself — see services/timetableEligibility.ts. */
  audience?: TimetableAudience
}

/** The streams Hub tags a lesson with. `null` (or absent) = the whole class. */
export type TimetableAudience =
  | 'ARABIC_A'
  | 'ARABIC_NON_A'
  | 'ISLAMIC'
  | 'NON_ISLAMIC'
  | null

/** A pupil's streaming flags, as Hub's GUARDIAN day view reports them. Sourced
 * from the pupil import (`religion`, `arabic_language`). Absent/unknown reads as
 * false, which is fail-closed: an unknown pupil never sees a restricted lesson. */
export interface PupilEligibility {
  arabicA?: boolean
  muslim?: boolean
}

/** One child inside the guardian day view. */
export interface HubGuardianChild {
  pupilId: string
  firstName?: string
  lastName?: string
  class?: { id: string; name: string } | null
  eligibility?: PupilEligibility | null
  blocks?: HubTimetableBlock[]
}

/** Hub's GUARDIAN-scoped day view: every child of one guardian, with blocks
 * already filtered to each child's eligibility. Connect reads it for the
 * `eligibility` flags (the class view carries the richer blocks — teacher, room
 * — that the parent timetable renders). */
export interface HubGuardianDay {
  version_id?: string
  state_hash?: string | null
  date?: string
  week_label?: 'A' | 'B' | null
  guardianId?: string
  children?: HubGuardianChild[]
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

/** Hard stop on the guardian paging loop — a backstop against a Hub that keeps
 * answering with fresh rows forever, not a real limit (50 × a 200-row page is
 * 10,000 guardians). */
const MAX_GUARDIAN_PAGES = 50

/** The paging conventions we're willing to try, in order. Hub's contract isn't
 * documented on our side, so rather than hard-code a guess we probe: the style
 * that actually returns rows we haven't seen is the one we then page with. The
 * winning style is logged, so prod tells us the real contract. */
const PAGE_STYLES: Array<{ name: string; build: (pageSize: number, page: number) => Record<string, string> }> = [
  { name: 'limit/offset', build: (size, page) => ({ limit: String(size), offset: String(size * page) }) },
  { name: 'page/pageSize', build: (size, page) => ({ page: String(page + 1), pageSize: String(size) }) },
  { name: 'limit/skip', build: (size, page) => ({ limit: String(size), skip: String(size * page) }) },
  { name: 'page/per_page', build: (size, page) => ({ page: String(page + 1), per_page: String(size) }) },
  { name: 'take/skip', build: (size, page) => ({ take: String(size), skip: String(size * page) }) },
]

/** Does a first page LOOK like a cap rather than the whole truth? A round page
 * (200, 250, 500 …) is the signature of a server-side limit; an arbitrary count
 * is almost certainly everyone there is. Only a suspicious count is worth
 * spending probe requests on — a school with 137 guardians does zero extra work. */
function looksCapped(count: number): boolean {
  return count >= 100 && count % 50 === 0
}

/** Anything Hub sends alongside `guardians` — `total`, `hasMore`, `nextCursor`,
 * a `pagination` object — is the contract telling us how to ask for the rest.
 * We don't consume it (we don't know the shape), but we log it once so the next
 * sync in prod reveals it instead of us guessing at query params forever. */
function logEnvelope(envelope: Record<string, unknown>, rowCount: number): void {
  const extras = Object.keys(envelope).filter((k) => k !== 'guardians')
  if (extras.length === 0) {
    console.log(
      `[hubMis] guardians: Hub sent ${rowCount} rows and no pagination metadata ` +
        `(envelope keys: guardians only) — if the school has more, Hub is capping silently`,
    )
    return
  }
  const detail = extras
    .map((k) => {
      const v = envelope[k]
      return `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`
    })
    .join(' ')
  console.log(`[hubMis] guardians: ${rowCount} rows, envelope also carried ${detail}`)
}

/** Guardians (parents/carers) for a Hub school, with their pupil links. Each
 * link's `pupilId` is a Hub pupil id; sync resolves it to a Connect Student via
 * `Student.hubPupilId`.
 *
 * Hub answers this endpoint one PAGE at a time (observed: a flat 200 rows for a
 * school with more guardians than that), so we keep asking until it stops giving
 * us anyone new. Deliberately conservative, because the paging contract isn't
 * pinned on our side:
 *   * the FIRST request is exactly what it always was — no params — so a Hub
 *     that returns everything in one go behaves precisely as before;
 *   * a page that errors (e.g. Hub rejects the params) is swallowed: we keep the
 *     rows we already have rather than failing the whole roster sync;
 *   * pages are deduped by guardian id, and a style that adds nobody new is
 *     abandoned — so a Hub that IGNORES paging params costs a couple of wasted
 *     requests instead of looping forever.
 * The net effect is never worse than the single-page behaviour it replaces. */
export async function listGuardians(hubSchoolId: string): Promise<HubGuardian[]> {
  let firstEnvelope: Record<string, unknown> = {}
  const fetchPage = async (extra: Record<string, string> = {}): Promise<HubGuardian[]> => {
    const params = new URLSearchParams({ schoolId: hubSchoolId, ...extra })
    const envelope = await call<Record<string, unknown> & { guardians: HubGuardian[] }>(
      `/guardians?${params.toString()}`,
    )
    if (Object.keys(firstEnvelope).length === 0) firstEnvelope = envelope
    return envelope.guardians ?? []
  }

  const first = await fetchPage()
  logEnvelope(firstEnvelope, first.length)
  if (first.length === 0) return first

  // A page that isn't a suspiciously round number is everyone Hub has — don't
  // spend requests probing for a page 2 that cannot exist.
  if (!looksCapped(first.length)) return first

  const pageSize = first.length
  const all = [...first]
  const seen = new Set(all.map((g) => g.id))

  /** Append a page's new rows; returns how many were actually new. */
  const absorb = (rows: HubGuardian[]): number => {
    let fresh = 0
    for (const g of rows) {
      if (seen.has(g.id)) continue
      seen.add(g.id)
      all.push(g)
      fresh++
    }
    return fresh
  }

  // Probe each style with its page 2 until one gives us someone new.
  let style: (typeof PAGE_STYLES)[number] | null = null
  let lastLength = 0
  for (const candidate of PAGE_STYLES) {
    try {
      const rows = await fetchPage(candidate.build(pageSize, 1))
      if (absorb(rows) > 0) {
        style = candidate
        lastLength = rows.length
        console.log(`[hubMis] guardians: paging with ${candidate.name} (page size ${pageSize})`)
        break
      }
    } catch (err) {
      console.warn(`[hubMis] guardians: ${candidate.name} paging rejected by Hub:`, err)
    }
  }
  // Nothing paged — either Hub sent everything already, or it ignores/refuses
  // every style we know. Either way, what we have is what there is.
  if (!style || lastLength < pageSize) return all

  for (let page = 2; page < MAX_GUARDIAN_PAGES; page++) {
    let rows: HubGuardian[]
    try {
      rows = await fetchPage(style.build(pageSize, page))
    } catch (err) {
      console.warn(`[hubMis] guardians: page ${page} failed; keeping ${all.length} fetched so far:`, err)
      break
    }
    if (absorb(rows) === 0) break
    if (rows.length < pageSize) break // a short page is the last page
  }

  return all
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

/** Hub's guardian-scoped day view — the parent-facing timetable, already
 * filtered per child by eligibility. Addressed by Hub guardian id OR guardian
 * email (Connect holds both: `User.hubGuardianId` and `User.email`). Returns
 * `null` on a 404 (no published timetable for that date, or a guardian Hub
 * doesn't know), so callers degrade instead of failing. */
export async function getGuardianDay(
  hubSchoolId: string,
  guardian: { guardianId?: string | null; guardianEmail?: string | null },
  date: string,
): Promise<HubGuardianDay | null> {
  const params = new URLSearchParams({ schoolId: hubSchoolId, date })
  if (guardian.guardianId) params.set('guardian_id', guardian.guardianId)
  else if (guardian.guardianEmail) params.set('guardian_email', guardian.guardianEmail)
  else return null
  return callAllow404<HubGuardianDay>(`/timetable/effective/day?${params.toString()}`)
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
