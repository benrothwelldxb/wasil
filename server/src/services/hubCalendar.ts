// Wasil Hub calendar client (Stage 4 / Phase A) — the read side of Hub's
// school-calendar surface. Hub owns the calendar; Connect pulls it (one-way,
// read-only) and mirrors it into its own Event table (see hubCalendarSync.ts).
//
// Same shape as hubMis.ts: a per-app `wsk_…` Bearer service token, resolved
// lazily so this module imports/typechecks/mocks without one. The token needs
// the `calendar:read` scope, which the current wsk token does NOT have yet —
// so every call here is **scope-gated + dormant**: a 404 (no such school /
// window) OR a 403 (missing scope) resolves to `null`, letting the sync no-op
// instead of throwing. Only the token being entirely unset throws
// (HubServiceTokenMissingError), which the sync short-circuits before calling.

import { HubServiceTokenMissingError, HubMisError } from './hubMis.js'

// --- Proposal (write) — Stage 4 / Phase B ------------------------------------
/** Body of POST /api/v1/calendar/events/proposals. `starts_at`/`ends_at` are
 * UTC ISO; `year_group_ids`/`class_ids` are **Hub** ids. Scope `calendar:submit`
 * (propose-only — no read/publish). */
export interface CalendarProposalInput {
  school_id: string
  title: string
  starts_at: string
  ends_at: string
  all_day?: boolean
  category?: string
  audience?: string
  location?: string
  whole_school?: boolean
  year_group_ids?: string[]
  class_ids?: string[]
  submitter_name?: string
  submitter_email?: string
  note?: string
}

/** Hub's 202 response to a proposal submission. */
export interface CalendarProposalResult {
  proposal_id: string
  status: 'PENDING'
}

// --- Config (env, resolved lazily per-call) ---------------------------------
function misBaseUrl(): string {
  const raw = process.env.HUB_MIS_URL || process.env.HUB_URL || 'https://hub.wasil.app'
  return raw.replace(/\/$/, '')
}
function serviceToken(): string {
  return process.env.HUB_SERVICE_TOKEN || ''
}

// --- DTOs — mirror of Hub's CalendarEventDTO (only fields Connect maps) -------
/** Cohort targeting on a Hub calendar event. Either whole-school, or explicit
 * lists of year-group / class **names** (resolved to Connect rows during sync).
 * Absent cohort is treated as whole-school. */
export type CalendarCohort =
  | { whole_school: true }
  | { year_groups: string[]; classes: string[] }

export interface CalendarEventDTO {
  id: string
  title: string
  description: string | null
  category: string
  location: string | null
  all_day: boolean
  starts_at: string // ISO 8601
  ends_at: string // ISO 8601
  kit: boolean
  audience?: string
  cohort?: CalendarCohort
}

/** Response shape of GET /api/v1/calendar/events. */
export interface CalendarEventsResponse {
  from: string
  to: string
  events: CalendarEventDTO[]
  state_hash: string | null
  cursor: number | null
}

/** Response shape of GET /api/v1/calendar/changes. */
export interface CalendarChangesResponse {
  events: CalendarEventDTO[]
  /** Ids removed since the cursor — mirrored events should be un-linked/removed. */
  removed?: string[]
  cursor: number | null
}

// --- Fetch wrapper -----------------------------------------------------------
/** GET a Hub calendar path. A 404 (unknown school/window) OR 403 (missing
 * `calendar:read` scope) resolves to `null` — both are expected "not available
 * yet" states the sync treats as a no-op. Other non-2xx throw HubMisError. The
 * token being unset throws HubServiceTokenMissingError. */
async function callAllowMissing<T>(path: string): Promise<T | null> {
  const token = serviceToken()
  if (!token) throw new HubServiceTokenMissingError()

  const res = await fetch(`${misBaseUrl()}/api/v1${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (res.status === 404 || res.status === 403) return null
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HubMisError(res.status, body || res.statusText)
  }
  return (await res.json()) as T
}

// --- Endpoints (read-only) ---------------------------------------------------
/** Windowed pull of a Hub school's calendar events. `from`/`to` are `YYYY-MM-DD`.
 * Returns `null` when the calendar isn't available to this token (no scope) or
 * the school/window is unknown (404). */
export async function getEvents(
  hubSchoolId: string,
  from: string,
  to: string,
  category?: string,
): Promise<CalendarEventsResponse | null> {
  const params = new URLSearchParams({ schoolId: hubSchoolId, from, to })
  if (category) params.set('category', category)
  return callAllowMissing<CalendarEventsResponse>(`/calendar/events?${params.toString()}`)
}

/** Incremental deltas since a persisted cursor. Returns `null` when the
 * calendar isn't available to this token (no scope / 404). */
export async function getChanges(
  hubSchoolId: string,
  since: number,
): Promise<CalendarChangesResponse | null> {
  const params = new URLSearchParams({ schoolId: hubSchoolId, since: String(since) })
  return callAllowMissing<CalendarChangesResponse>(`/calendar/changes?${params.toString()}`)
}

// --- Endpoints (write / propose-only) ----------------------------------------
/** Submit a teacher event proposal to Hub (Phase B). Propose-only: Hub stores it
 * PENDING for super-admin approval and returns `{ proposal_id, status:'PENDING' }`;
 * approval later arrives as a normal CalendarEvent via the read-side sync (no
 * rejection signal, and the proposal can't be recalled — Hub is propose-only).
 *
 * Unlike the read side (which resolves 403/404 to `null` so the sync no-ops),
 * this THROWS on any non-2xx (`HubMisError`) or an unset token
 * (`HubServiceTokenMissingError`), so the caller can refuse to create the local
 * PENDING row when the submission didn't reach Hub. */
export async function submitProposal(
  input: CalendarProposalInput,
): Promise<CalendarProposalResult> {
  const token = serviceToken()
  if (!token) throw new HubServiceTokenMissingError()

  const res = await fetch(`${misBaseUrl()}/api/v1/calendar/events/proposals`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new HubMisError(res.status, body || res.statusText)
  }
  return (await res.json()) as CalendarProposalResult
}
