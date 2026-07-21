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

// Mirror of Hub's ClassDTO (subset). `yearGroupId` is a *Hub* year-group id,
// resolved to a Connect YearGroup during sync.
export interface HubClass {
  id: string
  name: string
  yearGroupId: string
  yearGroupName: string
}

// Mirror of Hub's PupilDTO (subset). Note: Hub's v1 MIS pupil surface carries
// no allergy/medical/UPN fields, so those Connect columns are never written
// from a sync (see hubSync mapping notes).
export interface HubPupil {
  id: string
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

// Mirror of Hub's SyncStatusDTO (subset) — the polling freshness signal.
export interface HubSyncStatus {
  schoolId: string
  lastChangedAt: string | null
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

/** Staff for a Hub school (includes pending-invite rows: hubUserId === null). */
export async function listStaff(hubSchoolId: string): Promise<HubStaff[]> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  const { staff } = await call<{ staff: HubStaff[] }>(`/staff?${params.toString()}`)
  return staff
}

/** When did each MIS entity-type last change for this school? Polling fallback
 * for the "stale data" banner (see INTEGRATION.md → Data freshness). */
export async function getSyncStatus(hubSchoolId: string): Promise<HubSyncStatus> {
  const params = new URLSearchParams({ schoolId: hubSchoolId })
  return call<HubSyncStatus>(`/sync-status?${params.toString()}`)
}
