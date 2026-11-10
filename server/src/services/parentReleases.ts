// "What's new" for parents — the headline features, written where they ship.
//
// The same idea as Active's and Desk's release notes: the entries live in code,
// with the deploy that carries the feature. A note written somewhere else can
// describe something that is not live yet, or outlive the thing it describes.
// This one cannot, because shipping the note IS shipping the feature.
//
// Only changes a parent would notice and want to know about belong here. A
// parent shown every fix learns to close the box without reading it, and then
// the announcement that mattered goes unread too. The bar: would the school
// have put it in a newsletter?

/** A school's module switches, by the column name on School. A feature that
 *  lives inside a module the school has turned off is not announced there. */
export type SchoolModuleFlag = 'postsEnabled' | 'inboxEnabled' | 'formsEnabled' | 'eventsEnabled'

export interface ParentRelease {
  /** Stable id, the seen-record key. Never re-use or re-word one after it has
   *  shipped, or parents who dismissed it will be shown it again. */
  id: string
  /** ISO date the feature went live for parents. Drives ordering, ageing out,
   *  and "not news to someone who joined after it". */
  date: string
  /** Short and plain: what the parent can now do. */
  title: string
  /** One or two sentences, in the parent's terms. How to use it, not what was built. */
  blurb: string
  /** Which of the app's icons to show beside it. The app maps the name. */
  icon: 'pin' | 'eye-off' | 'sparkles'
  /** Where to try it, as a path in the parent app. Omit when it is everywhere. */
  href?: string
  /** Label for that link. */
  cta?: string
  /** The module it lives in. Off at the parent's school → not announced. */
  requires?: SchoolModuleFlag
}

/** Newest first. */
export const PARENT_RELEASES: ParentRelease[] = [
  {
    id: '2026-11-hide-posts',
    date: '2026-11-10',
    title: "Hide posts you don't need",
    blurb:
      "Swipe a post to the side, or tap the eye icon on it, to take it off your home screen. Changed your mind? Open Posts and choose Hidden to put it back. Anything still waiting on you, like a form to sign, stays put.",
    icon: 'eye-off',
    requires: 'postsEnabled',
  },
  {
    id: '2026-11-unpin-posts',
    date: '2026-11-05',
    title: "Unpin a post once you've read it",
    blurb:
      'The school pins important posts to the top of your feed. Once you have read one, tap Unpin and it drops back into date order. It stays pinned for everyone else.',
    icon: 'pin',
    requires: 'postsEnabled',
  },
]

/**
 * How long an entry stays announceable. A parent opening the app for the first
 * time in a month should hear what changed, not every change since September.
 */
export const RELEASE_MAX_AGE_DAYS = 45

/** At most this many in one box. Beyond that nobody reads to the bottom. */
export const RELEASE_MAX_SHOWN = 3

export interface ReleaseViewer {
  /** When this parent's account was made. A feature older than the account is
   *  not new to them: they never knew the app without it. */
  joinedAt: Date
  /** The parent's school's module switches. */
  school: Partial<Record<SchoolModuleFlag, boolean>>
}

/**
 * What to show this parent: entries for them, recent enough to be news, newer
 * than their account, not already dismissed. Newest first, capped.
 *
 * `releases` and `now` are injected so this is testable.
 */
export function unseenReleases(
  who: ReleaseViewer,
  seenIds: Iterable<string>,
  now: Date = new Date(),
  releases: ParentRelease[] = PARENT_RELEASES,
): ParentRelease[] {
  const seen = new Set(seenIds)
  const cutoff = now.getTime() - RELEASE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  // Compared by day: an account made the afternoon a feature went live has
  // still met the app with it, so it is not news to them either.
  const joinedDay = who.joinedAt.toISOString().slice(0, 10)
  return releases
    .filter(r => !seen.has(r.id))
    .filter(r => !r.requires || who.school[r.requires] !== false)
    .filter(r => {
      const t = Date.parse(r.date)
      // An unparseable date is a typo in a note somebody wrote. Showing it is a
      // better failure than silently dropping the announcement.
      if (Number.isNaN(t)) return true
      return t >= cutoff && t <= now.getTime() && r.date > joinedDay
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RELEASE_MAX_SHOWN)
}

export function isKnownRelease(id: string): boolean {
  return PARENT_RELEASES.some(r => r.id === id)
}
