// Wasil Inclusion — a child's SEND plan, documents and therapy sessions.
//
// Inclusion (the SEND app) is the system of record. Connect READS and stores
// NOTHING: no plan, no target, no document metadata, no cache. Every page load
// asks Inclusion. There is nothing here to model, sync or invalidate, and that
// is deliberate rather than lazy — a cached plan is a plan that keeps being
// shown to a family after a SENCO has withdrawn it.
//
// WHY THERE IS NO PUBLICATION RULE IN THIS FILE. Connect used to hold one: a
// push lane with its own `parentVisible` column, and a bug where a caller who
// never mentioned the flag published a child's plan to their family by
// omission. That lane was decommissioned the same day the pull was agreed, and
// the rule now lives in exactly one place — Inclusion's own
// `familyVisibleIeps()`. Connect does not filter, cannot filter, and must not
// start: two copies of a rule about what a family may read is how they drift.
// Whatever Inclusion returns is what a parent sees.
//
// IDENTIFIERS ARE HUB'S, not Connect's. Inclusion resolves a guardian against
// its own Hub mirror and has never seen a Connect id. Same convention as the
// Active and Hub clients beside this one.

/** Inclusion isn't configured for this deployment — no base URL or no token. */
export class InclusionNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`Wasil Inclusion is not configured (${missing})`)
    this.name = 'InclusionNotConfiguredError'
  }
}

/** Inclusion answered, but not with what was asked for. `status` is theirs. */
export class InclusionError extends Error {
  constructor(public status: number, message: string) {
    super(`Wasil Inclusion ${status}: ${message}`)
    this.name = 'InclusionError'
  }
}

/** A label already phrased for a parent, with a tone to render it by. Inclusion
 *  composes both: a raw grading would leave Connect inventing the wording for
 *  a judgement about a child, which is the school's to make and not ours. */
export interface InclusionLabel {
  label: string
  tone: string
}

export interface InclusionTarget {
  id: string
  target_number: number
  needs_category: string
  needs_category_label: string
  target_statement: string
  progress: InclusionLabel | null
  progress_notes: string | null
  outcome_at_review: InclusionLabel | null
}

export interface InclusionPlan {
  id: string
  version: number
  status: string
  status_label: string
  stage: string
  stage_label: string
  start_date: string | null
  review_date: string | null
  completed_review_date: string | null
  current_strengths: string | null
  barriers_to_learning: string | null
  shared_at: string | null
  parent_acknowledged: boolean
  parent_acknowledged_at: string | null
  /** OMITTED, not empty, when the token lacks the targets grant. Undefined is
   *  "I was not told", which is a different sentence from "this plan has no
   *  targets" and must not render as one. */
  targets?: InclusionTarget[]
}

export interface InclusionChild {
  pupil_id: string
  first_name?: string
  last_name?: string
  has_active_iep: boolean
}

/**
 * One file Inclusion is sharing, in Inclusion's own shape.
 *
 * THE URLS ARE COMPLETE AND ABSOLUTE, each carrying its own freshly minted
 * token, and `download_url` is the view one plus the save flag. Connect takes
 * both as given and builds neither — an earlier version of this file invented
 * a `file_token` that does not exist and composed URLs from it.
 */
export interface InclusionFile {
  id: string
  title: string
  document_type?: string | null
  document_type_label?: string | null
  file_name?: string | null
  mime_type?: string | null
  size_bytes?: number | null
  created_at?: string | null
  available_until?: string | null
  /** Past retention, the RECORD survives and the file does not. Both urls are
   *  null. A parent is told it is no longer available rather than handed a
   *  link that fails — the session and the therapist's note still matter. */
  file_deleted?: boolean
  view_url?: string | null
  download_url?: string | null
}

/** A therapy session: the note, and any media attached to it. Therapy media
 *  ONLY — every other shared file is in `documents`. */
export interface InclusionSession {
  id: string
  session_date?: string | null
  provider_name?: string | null
  provider_note?: string | null
  files: InclusionFile[]
}

export interface InclusionDocuments {
  sessions: InclusionSession[]
  documents: InclusionFile[]
  /** ONE expiry for every link in the response. Which is why Connect never
   *  stores these URLs: a parent who opens the page and taps a file six
   *  minutes later would be following a dead link. */
  links_expire_at?: string | null
}

const baseUrl = () => process.env.SEND_API_URL?.replace(/\/+$/, '') || ''
const serviceToken = () => process.env.SEND_SERVICE_TOKEN || ''

/** Is the integration wired up at all? Both halves are required, so a
 *  half-configured deployment reads as off rather than failing at the fetch. */
export function inclusionConfigured(): boolean {
  return baseUrl().length > 0 && serviceToken().length > 0
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!baseUrl()) throw new InclusionNotConfiguredError('SEND_API_URL')
  if (!serviceToken()) throw new InclusionNotConfiguredError('SEND_SERVICE_TOKEN')

  const res = await fetch(`${baseUrl()}${path}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${serviceToken()}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Inclusion denies by default and names the missing scope in the body, so
    // it is passed through rather than flattened: a 403 here is far more often
    // a token without `send:iep:read:guardian` than anything wrong with the
    // request, and that is a five-minute fix only if the message survives.
    throw new InclusionError(res.status, body || res.statusText)
  }
  return (await res.json()) as T
}

/** The children Inclusion links to this guardian, with a SEND summary each. */
export async function fetchChildren(opts: {
  hubSchoolId: string
  guardianId: string
}): Promise<{ children: InclusionChild[] }> {
  const data = await get<{ children?: InclusionChild[] }>('/api/v1/guardian/children', {
    schoolId: opts.hubSchoolId,
    guardian_id: opts.guardianId,
  })
  return { children: data.children ?? [] }
}

/**
 * One child's published plan, or null.
 *
 * NULL COVERS TWO CASES ON PURPOSE and Connect must not try to tell them
 * apart: never shared, and shared-then-withdrawn. Distinguishing them would
 * mean Connect remembering what it had shown before — a SEND fact held in
 * Connect, which is the one thing this lane exists to avoid, and it would be
 * wrong in the case that matters most. A plan unpublished BECAUSE IT WENT TO
 * THE WRONG FAMILY must leave no trace at all; a card reading "a plan was here
 * and is being updated" would tell a family something true about another
 * child, at the exact moment somebody is undoing that.
 *
 * SO INCLUSION SENDS THE MARK, not Connect inferring one. `notice` arrives
 * beside a null plan when a shared plan was archived or moved back to draft —
 * for 60 days, and NEVER for an explicit "stop sharing", which is the case
 * where a trace would be actively harmful.
 */
export async function fetchPlan(opts: {
  hubSchoolId: string
  guardianId: string
  hubPupilId: string
}): Promise<{ plan: InclusionPlan | null; notice?: string }> {
  const data = await get<{ iep?: InclusionPlan | null; notice?: string }>(
    `/api/v1/guardian/children/${encodeURIComponent(opts.hubPupilId)}/iep`,
    { schoolId: opts.hubSchoolId, guardian_id: opts.guardianId },
  )
  // PASSED THROUGH VERBATIM, never mapped. Inclusion composes the sentence
  // because Inclusion knows which case this is; a mapping table on Connect's
  // side would be the same inference problem relocated, with Connect deciding
  // what a withdrawal means to a parent. Absent, not null, when there is
  // nothing to say.
  return { plan: data.iep ?? null, ...(data.notice ? { notice: data.notice } : {}) }
}

/** Shared documents and therapy sessions for one child. */
export async function fetchDocuments(opts: {
  hubSchoolId: string
  guardianId: string
  hubPupilId: string
}): Promise<InclusionDocuments> {
  const data = await get<Partial<InclusionDocuments>>(
    `/api/v1/guardian/children/${encodeURIComponent(opts.hubPupilId)}/documents`,
    { schoolId: opts.hubSchoolId, guardian_id: opts.guardianId },
  )
  return {
    documents: data.documents ?? [],
    sessions: data.sessions ?? [],
    links_expire_at: data.links_expire_at ?? null,
  }
}

/** Find one file across both places Inclusion puts them. */
export function findFile(docs: InclusionDocuments, fileId: string): InclusionFile | undefined {
  return (
    docs.documents.find(d => d.id === fileId) ??
    docs.sessions.flatMap(s => s.files ?? []).find(f => f.id === fileId)
  )
}
