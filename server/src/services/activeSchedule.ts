// Wasil Active — a child's week of clubs and fixtures.
//
// Active is the system of record for extra-curricular activities: it holds the
// dated sessions (term exclusions and closure days already removed), the
// confirmed assignments, and the fixtures with the children selected for them.
// Connect reads a week of that and renders it; it stores none of it, and there
// is nothing here to model, sync or invalidate.
//
// Asked by PUPIL, never by guardian. Connect owns the household and knows whose
// children are whose; Active does not and should not learn. So the caller
// resolves the child, checks the requester is their guardian, and asks for that
// one pupil.
//
// TIMES ARE WALL CLOCK IN THE SCHOOL'S OWN ZONE, and `timezone` on the response
// names it. "15:15" means quarter past three at that school, and there is no
// offset to apply — a parent in Dubai reading a Dubai school's Wednesday sees
// 15:15 whether they open the app at home or from a business trip.
//
// Connect specifically must not reach for its own helpers here. `dateTime.ts`
// exists to turn a zone-less wall clock into an instant, because an admin's
// typed "11:30" was being read as UTC and posts published four hours late.
// This is the same-shaped value with the opposite correct handling: passing
// these through the device's zone would shift the entire week by the offset,
// and would look entirely plausible doing it. Pass them through as strings.
import { todayInTimezone } from './dateTime.js'

/** Active isn't configured for this deployment — no base URL or no token. */
export class ActiveNotConfiguredError extends Error {
  constructor(missing: string) {
    super(`Wasil Active is not configured (${missing})`)
    this.name = 'ActiveNotConfiguredError'
  }
}

/** Active answered, but not with a schedule. `status` is Active's own. */
export class ActiveScheduleError extends Error {
  constructor(public status: number, message: string) {
    super(`Wasil Active ${status}: ${message}`)
    this.name = 'ActiveScheduleError'
  }
}

export interface ActiveScheduleItem {
  id?: string
  /** `club` recurs every week; `fixture` is an event. Worth rendering apart. */
  kind: 'club' | 'fixture'
  /** Already composed — a fixture reads "U11 A Netball v Dubai English Speaking
   *  School". Not for Connect to assemble. */
  name: string
  /** Wall clock, "15:15". Never converted. */
  starts_at: string
  /** A fixture has none — use `returns_at`. */
  ends_at?: string | null
  /** Where to collect them; a fixture's is already phrased ("Away at …"). */
  venue?: string | null
  /** club: scheduled | cancelled | completed. fixture: adds postponed | played. */
  status: string
  /** The school's own words. Shown verbatim, never paraphrased. */
  cancellation_reason?: string | null
  /** Fixtures only — the afternoon around the match, which is what a parent
   *  actually plans against. */
  departs_at?: string | null
  returns_at?: string | null
  /** Set on a club session THIS child is missing because of their own fixture.
   *  Per child, not per club: the rest of the squad still trains that day. */
  displaced_by_fixture_id?: string | null
}

export interface ActiveScheduleDay {
  /** YYYY-MM-DD. Every date in the range comes back, including empty ones — a
   *  missing Tuesday is indistinguishable from a Tuesday that failed to load. */
  date: string
  items: ActiveScheduleItem[]
}

export interface ActiveChildWeek {
  /** The zone every time above is already expressed in. Display only. */
  timezone: string
  days: ActiveScheduleDay[]
  /** Active has never heard of this pupil — almost always a pupil that hasn't
   *  synced from Hub yet. NOT the same as a child with nothing on, and the
   *  caller must not render it as an empty week: a family mid-sync would be
   *  told, in writing, that their child has no clubs on the morning after they
   *  were allocated one. */
  unknown: boolean
}

const baseUrl = () => process.env.ACTIVE_API_URL?.replace(/\/+$/, '') || ''
const serviceToken = () => process.env.ACTIVE_PARTNER_TOKEN || ''

/** Is the Active integration wired up at all? Both halves are required, so a
 *  half-configured deployment reads as off rather than failing at the fetch. */
export function activeConfigured(): boolean {
  return baseUrl().length > 0 && serviceToken().length > 0
}

/**
 * The Monday-to-Sunday week containing `anchor`, as YYYY-MM-DD in the school's
 * own timezone. Built from the school's local date rather than the server's,
 * because a UTC+4 school's Monday starts four hours before the server agrees.
 */
export function schoolWeekBounds(timezone: string, anchor?: string): { from: string; to: string } {
  const today = anchor || todayInTimezone(timezone)
  const [y, m, d] = today.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d))
  // getUTCDay: 0 = Sunday. Monday-based offset.
  const back = (at.getUTCDay() + 6) % 7
  const monday = new Date(at.getTime() - back * 86400000)
  const sunday = new Date(monday.getTime() + 6 * 86400000)
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  return { from: iso(monday), to: iso(sunday) }
}

/**
 * One child's week.
 *
 * Matched on `hub_pupil_id` rather than taken from position, even though we ask
 * for a single pupil. `pupils[]` is built from the pupils Active RECOGNISED, so
 * anyone in `unknown_pupils` is absent from it and the order stops matching
 * what was sent — a consumer trusting position would read the wrong child's
 * week for a family mid-sync, which is precisely the case `unknown_pupils`
 * exists to flag. Position would work today and break on the first batch.
 */
export async function fetchChildWeek(opts: {
  hubSchoolId: string
  hubPupilId: string
  from: string
  to: string
}): Promise<ActiveChildWeek> {
  if (!baseUrl()) throw new ActiveNotConfiguredError('ACTIVE_API_URL')
  if (!serviceToken()) throw new ActiveNotConfiguredError('ACTIVE_PARTNER_TOKEN')

  const params = new URLSearchParams({
    school_id: opts.hubSchoolId,
    hub_pupil_ids: opts.hubPupilId,
    from: opts.from,
    to: opts.to,
  })

  const res = await fetch(`${baseUrl()}/api/partner/schedule?${params.toString()}`, {
    headers: { authorization: `Bearer ${serviceToken()}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // A 403 here is very likely the `schedule:read` scope missing from this
    // token rather than anything wrong with the request — Active denies by
    // default and names the scope in the body, so it is passed through.
    throw new ActiveScheduleError(res.status, body || res.statusText)
  }

  const data = (await res.json()) as {
    timezone?: string
    pupils?: Array<{ hub_pupil_id?: string; days?: ActiveScheduleDay[] }>
    unknown_pupils?: string[]
  }

  const unknown = (data.unknown_pupils ?? []).includes(opts.hubPupilId)
  const entry = data.pupils?.find(p => p.hub_pupil_id === opts.hubPupilId)
  return {
    timezone: data.timezone ?? 'UTC',
    days: entry?.days ?? [],
    unknown,
  }
}
