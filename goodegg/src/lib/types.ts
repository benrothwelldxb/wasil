/**
 * Be a Good Egg — domain types.
 *
 * These mirror the Supabase schema (see /supabase/migrations and /docs/DATABASE.md).
 * The same shapes are used by the local demo provider and the Supabase provider,
 * so the UI never needs to know which backend is behind it.
 */

export type GroupStatus =
  | 'draft'
  | 'open'
  | 'ready'
  | 'drawn'
  | 'revealed'
  | 'archived'

export type MemberRole = 'organiser' | 'participant'

export type SweetOrSavoury = 'sweet' | 'savoury' | 'both'

export interface Profile {
  id: string
  display_name: string
  email: string | null
  avatar_seed: string | null
  created_at: string
}

export interface Group {
  id: string
  name: string
  description: string | null
  organiser_id: string
  status: GroupStatus
  join_code: string
  /** Optional suggested surprise budget in whole GBP (£). Never framed as a requirement. */
  suggested_budget: number | null
  created_at: string
  draw_at: string | null
  reveal_date: string | null
}

export interface GroupMember {
  id: string
  group_id: string
  profile_id: string
  role: MemberRole
  joined_at: string
  /** Cached completion flag — the full buddy profile lives in buddy_profiles. */
  profile_complete: boolean
}

/**
 * The preferences a participant shares specifically for Secret Buddy.
 * Deliberately lightly normalised: arrays/free-text over many tables.
 */
export interface BuddyProfile {
  id: string
  group_id: string
  profile_id: string
  preferred_name: string
  birthday: string | null
  drink: string
  sweet_or_savoury: SweetOrSavoury | null
  favourite_snacks: string[]
  favourite_shops: string[]
  interests: string[]
  favourite_colours: string[]
  little_things: string
  dislikes: string[]
  dietary_requirements: string[]
  free_text: string
  updated_at: string
}

/** Extremely sensitive. Only ever read via privileged, per-giver access. */
export interface Assignment {
  id: string
  group_id: string
  giver_id: string
  receiver_id: string
  created_at: string
}

export interface Exclusion {
  id: string
  group_id: string
  /** giver_id must never be assigned receiver_id. */
  giver_id: string
  receiver_id: string
  reason: string | null
  created_at: string
}

export type QuestionStatus = 'pending' | 'answered' | 'declined'

export interface AnonymousQuestion {
  id: string
  group_id: string
  /** The asker (the giver). Never revealed to the recipient. */
  sender_id: string
  /** The recipient (the giver's assigned buddy). */
  recipient_id: string
  question: string
  answer: string | null
  status: QuestionStatus
  created_at: string
  answered_at: string | null
}

export interface Mission {
  id: string
  group_id: string
  title: string
  tagline: string
  body: string
  /** Optional theme colour key for the card. */
  accent: 'sage' | 'lilac' | 'peach' | 'yolk' | 'coral'
  starts_at: string | null
  ends_at: string | null
  created_at: string
}

export type AccompliceStatus = 'invited' | 'active' | 'declined'

/** An accomplice helps a giver surprise their buddy. Schema now; full flow later. */
export interface Accomplice {
  id: string
  group_id: string
  /** The giver who recruited help. */
  giver_id: string
  /** The colleague recruited to help. */
  helper_id: string
  status: AccompliceStatus
  created_at: string
}

// ---------------------------------------------------------------------------
// Derived / view models (not stored directly)
// ---------------------------------------------------------------------------

export type InboxKind =
  | 'question_answered'
  | 'question_received'
  | 'new_idea'
  | 'new_mission'
  | 'accomplice'

export interface InboxItem {
  id: string
  kind: InboxKind
  title: string
  body: string
  created_at: string
  read: boolean
  /** Optional route to open when tapped. */
  href?: string
}

/** A membership joined with its group and the current member's role. */
export interface Membership {
  group: Group
  member: GroupMember
}

/** Organiser-safe view of a participant — never includes assignment data. */
export interface ParticipantSummary {
  member_id: string
  profile_id: string
  display_name: string
  avatar_seed: string | null
  role: MemberRole
  profile_complete: boolean
  joined_at: string
}
