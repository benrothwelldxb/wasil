/**
 * DataProvider — the single boundary between the UI and any backend.
 *
 * Two implementations satisfy this contract:
 *   • LocalProvider    — in-browser, seeded demo backend (no Supabase needed).
 *   • SupabaseProvider  — real Postgres + Auth + RLS + the run-draw edge fn.
 *
 * The UI imports `provider` from ./index and never knows which is behind it.
 * Secrecy guarantees are the backend's job (RLS / edge function); the local
 * provider mirrors those rules so the demo behaves like production.
 */
import type {
  AnonymousQuestion,
  BuddyProfile,
  Exclusion,
  Group,
  GroupMember,
  GroupStatus,
  InboxItem,
  Membership,
  Mission,
  ParticipantSummary,
  Profile,
} from '@/lib/types'

/** A received question with the asker's identity stripped out. */
export type ReceivedQuestion = Omit<AnonymousQuestion, 'sender_id'>

export interface CreateGroupInput {
  name: string
  organiser_name: string
  description?: string
  reveal_date?: string | null
  suggested_budget?: number | null
}

export interface BuddyProfileInput {
  preferred_name: string
  birthday?: string | null
  drink: string
  sweet_or_savoury: BuddyProfile['sweet_or_savoury']
  favourite_snacks: string[]
  favourite_shops: string[]
  interests: string[]
  favourite_colours: string[]
  little_things: string
  dislikes: string[]
  dietary_requirements: string[]
  free_text: string
}

export interface RunDrawResult {
  count: number
  reciprocalCount: number
}

export interface DataProvider {
  readonly kind: 'local' | 'supabase'

  // --- Auth (passwordless) ---
  currentProfile(): Promise<Profile | null>
  /** Passwordless sign-in. Local provider resolves instantly. */
  signIn(email: string, displayName?: string): Promise<Profile>
  signOut(): Promise<void>
  updateMyProfile(patch: Partial<Pick<Profile, 'display_name' | 'avatar_seed'>>): Promise<Profile>

  // --- Groups ---
  createGroup(input: CreateGroupInput): Promise<Group>
  getGroup(groupId: string): Promise<Group | null>
  getGroupByCode(code: string): Promise<Group | null>
  updateGroup(groupId: string, patch: Partial<Pick<Group, 'name' | 'description' | 'reveal_date' | 'suggested_budget'>>): Promise<Group>
  setGroupStatus(groupId: string, status: GroupStatus): Promise<Group>
  listMyMemberships(): Promise<Membership[]>

  // --- Membership ---
  joinGroup(code: string, displayName: string): Promise<Membership>
  getMyMembership(groupId: string): Promise<GroupMember | null>
  listParticipants(groupId: string): Promise<ParticipantSummary[]>
  removeParticipant(groupId: string, memberId: string): Promise<void>

  // --- Buddy profile ---
  getMyBuddyProfile(groupId: string): Promise<BuddyProfile | null>
  upsertMyBuddyProfile(groupId: string, input: BuddyProfileInput): Promise<BuddyProfile>
  /** The buddy assigned TO the caller (the person they surprise). Null before draw/reveal. */
  getMyBuddy(groupId: string): Promise<BuddyProfile | null>

  // --- Exclusions ---
  listExclusions(groupId: string): Promise<Exclusion[]>
  addExclusion(groupId: string, giverId: string, receiverId: string, reason?: string): Promise<Exclusion>
  removeExclusion(groupId: string, exclusionId: string): Promise<void>

  // --- Draw (privileged) ---
  runDraw(groupId: string): Promise<RunDrawResult>
  /** The caller's own receiver id — the only assignment read path. */
  getMyReceiverId(groupId: string): Promise<string | null>
  hasRevealed(groupId: string): Promise<boolean>
  markRevealed(groupId: string): Promise<void>

  // --- Anonymous questions ---
  askQuestion(groupId: string, question: string): Promise<AnonymousQuestion>
  /** Questions the caller asked their buddy (with answers). */
  listQuestionsIAsked(groupId: string): Promise<AnonymousQuestion[]>
  /** Questions the caller must answer — asker identity stripped. */
  listQuestionsForMe(groupId: string): Promise<ReceivedQuestion[]>
  answerQuestion(questionId: string, answer: string): Promise<void>

  // --- Missions ---
  listMissions(groupId: string): Promise<Mission[]>
  currentMission(groupId: string): Promise<Mission | null>
  createMission(groupId: string, input: Omit<Mission, 'id' | 'group_id' | 'created_at'>): Promise<Mission>

  // --- Inbox ---
  listInbox(groupId: string): Promise<InboxItem[]>
  markInboxRead(groupId: string, itemId: string): Promise<void>
}
