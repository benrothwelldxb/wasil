/**
 * LocalProvider — an in-browser, seeded backend for demo & review.
 *
 * It deliberately mirrors the production secrecy rules so the demo behaves like
 * the real thing:
 *   • the only way to read "my buddy" is via the caller's own assignment row
 *   • recipients of anonymous questions never receive the asker's identity
 *   • the draw runs the same computeDraw engine used server-side
 *
 * State persists to localStorage so a review session survives refreshes.
 */
import { computeDraw, validateDraw } from '@/lib/draw'
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
import { makeJoinCode, nowIso, uid } from '@/lib/utils'
import {
  type BuddyProfileInput,
  type CreateGroupInput,
  type DataProvider,
  type ReceivedQuestion,
  type RunDrawResult,
} from './provider'
import { createSeedDb, type DemoDb } from './seed'

const STORAGE_KEY = 'goodegg.db.v1'
// A little latency makes loading states visible in the demo; zero under test.
const LATENCY_MS =
  typeof process !== 'undefined' && process.env?.VITEST ? 0 : 120

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
}

function emptyBuddy(groupId: string, profileId: string, name: string): BuddyProfile {
  return {
    id: `bp-${profileId}`,
    group_id: groupId,
    profile_id: profileId,
    preferred_name: name,
    birthday: null,
    drink: '',
    sweet_or_savoury: null,
    favourite_snacks: [],
    favourite_shops: [],
    interests: [],
    favourite_colours: [],
    little_things: '',
    dislikes: [],
    dietary_requirements: [],
    free_text: '',
    updated_at: nowIso(),
  }
}

export class LocalProvider implements DataProvider {
  readonly kind = 'local' as const
  private db: DemoDb

  constructor() {
    this.db = this.load()
  }

  private load(): DemoDb {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        try {
          return JSON.parse(raw) as DemoDb
        } catch {
          /* fall through to seed */
        }
      }
    }
    const seed = createSeedDb()
    this.persist(seed)
    return seed
  }

  private persist(db: DemoDb = this.db) {
    this.db = db
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
    }
  }

  /** Test/demo helper: wipe and re-seed. */
  reset(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY)
    this.persist(createSeedDb())
  }

  private me(): Profile | null {
    const id = this.db.currentProfileId
    return this.db.profiles.find((p) => p.id === id) ?? null
  }

  private requireMe(): Profile {
    const m = this.me()
    if (!m) throw new Error('Not signed in.')
    return m
  }

  private group(groupId: string): Group | undefined {
    return this.db.groups.find((g) => g.id === groupId)
  }

  // --- Auth ---
  currentProfile(): Promise<Profile | null> {
    return delay(this.me())
  }

  signIn(email: string, displayName?: string): Promise<Profile> {
    const normalized = email.trim().toLowerCase()
    let prof = this.db.profiles.find((p) => p.email?.toLowerCase() === normalized)
    if (!prof) {
      prof = {
        id: uid('prof-'),
        display_name: displayName?.trim() || email.split('@')[0] || 'New Egg',
        email,
        avatar_seed: uid('seed-'),
        created_at: nowIso(),
      }
      this.db.profiles.push(prof)
    } else if (displayName?.trim()) {
      prof.display_name = displayName.trim()
    }
    this.db.currentProfileId = prof.id
    this.persist()
    return delay(prof)
  }

  // Demo auth accepts any code — the gate is bypassed for the local provider.
  requestOtp(_email: string, _displayName?: string): Promise<void> {
    return delay(undefined)
  }
  verifyOtp(email: string, _code: string, displayName?: string): Promise<Profile> {
    return this.signIn(email, displayName)
  }

  signOut(): Promise<void> {
    this.db.currentProfileId = null
    this.persist()
    return delay(undefined)
  }

  updateMyProfile(patch: Partial<Pick<Profile, 'display_name' | 'avatar_seed'>>): Promise<Profile> {
    const me = this.requireMe()
    Object.assign(me, patch)
    this.persist()
    return delay(me)
  }

  // --- Groups ---
  createGroup(input: CreateGroupInput): Promise<Group> {
    let me = this.me()
    if (!me) {
      // Organiser identity is captured up front; a lightweight profile stands in
      // until they authenticate.
      me = {
        id: uid('prof-'),
        display_name: input.organiser_name,
        email: null,
        avatar_seed: uid('seed-'),
        created_at: nowIso(),
      }
      this.db.profiles.push(me)
      this.db.currentProfileId = me.id
    } else if (input.organiser_name.trim()) {
      me.display_name = input.organiser_name.trim()
    }
    const group: Group = {
      id: uid('grp-'),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      organiser_id: me.id,
      status: 'open',
      join_code: makeJoinCode(),
      suggested_budget: input.suggested_budget ?? null,
      created_at: nowIso(),
      draw_at: null,
      reveal_date: input.reveal_date ?? null,
    }
    this.db.groups.push(group)
    this.db.members.push({
      id: uid('mem-'),
      group_id: group.id,
      profile_id: me.id,
      role: 'organiser',
      joined_at: nowIso(),
      profile_complete: false,
    })
    this.persist()
    return delay(group)
  }

  getGroup(groupId: string): Promise<Group | null> {
    return delay(this.group(groupId) ?? null)
  }

  getGroupByCode(code: string): Promise<Group | null> {
    const c = code.trim().toUpperCase()
    return delay(this.db.groups.find((g) => g.join_code === c) ?? null)
  }

  updateGroup(
    groupId: string,
    patch: Partial<Pick<Group, 'name' | 'description' | 'reveal_date' | 'suggested_budget'>>,
  ): Promise<Group> {
    const g = this.group(groupId)
    if (!g) throw new Error('Group not found.')
    Object.assign(g, patch)
    this.persist()
    return delay(g)
  }

  setGroupStatus(groupId: string, status: GroupStatus): Promise<Group> {
    const g = this.group(groupId)
    if (!g) throw new Error('Group not found.')
    g.status = status
    this.persist()
    return delay(g)
  }

  listMyMemberships(): Promise<Membership[]> {
    const me = this.me()
    if (!me) return delay([])
    const result: Membership[] = []
    for (const m of this.db.members.filter((x) => x.profile_id === me.id)) {
      const g = this.group(m.group_id)
      if (g) result.push({ group: g, member: m })
    }
    return delay(result)
  }

  // --- Membership ---
  joinGroup(code: string, displayName: string): Promise<Membership> {
    const g = this.db.groups.find((x) => x.join_code === code.trim().toUpperCase())
    if (!g) throw new Error('That join code did not match a group.')
    let me = this.me()
    if (!me) {
      me = {
        id: uid('prof-'),
        display_name: displayName.trim() || 'New Egg',
        email: null,
        avatar_seed: uid('seed-'),
        created_at: nowIso(),
      }
      this.db.profiles.push(me)
      this.db.currentProfileId = me.id
    } else if (displayName.trim()) {
      me.display_name = displayName.trim()
    }
    let member = this.db.members.find(
      (m) => m.group_id === g.id && m.profile_id === me!.id,
    )
    if (!member) {
      member = {
        id: uid('mem-'),
        group_id: g.id,
        profile_id: me.id,
        role: 'participant',
        joined_at: nowIso(),
        profile_complete: false,
      }
      this.db.members.push(member)
    }
    this.persist()
    return delay({ group: g, member })
  }

  getMyMembership(groupId: string): Promise<GroupMember | null> {
    const me = this.me()
    if (!me) return delay(null)
    return delay(
      this.db.members.find((m) => m.group_id === groupId && m.profile_id === me.id) ?? null,
    )
  }

  listParticipants(groupId: string): Promise<ParticipantSummary[]> {
    // Organiser-safe: names + completion only. Never assignment data.
    const rows = this.db.members
      .filter((m) => m.group_id === groupId)
      .map<ParticipantSummary>((m) => {
        const p = this.db.profiles.find((x) => x.id === m.profile_id)
        return {
          member_id: m.id,
          profile_id: m.profile_id,
          display_name: p?.display_name ?? 'Unknown',
          avatar_seed: p?.avatar_seed ?? null,
          role: m.role,
          profile_complete: m.profile_complete,
          joined_at: m.joined_at,
        }
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
    return delay(rows)
  }

  removeParticipant(groupId: string, memberId: string): Promise<void> {
    const member = this.db.members.find((m) => m.id === memberId && m.group_id === groupId)
    if (member) {
      this.db.members = this.db.members.filter((m) => m.id !== memberId)
      this.db.buddyProfiles = this.db.buddyProfiles.filter(
        (b) => !(b.group_id === groupId && b.profile_id === member.profile_id),
      )
    }
    this.persist()
    return delay(undefined)
  }

  // --- Buddy profile ---
  getMyBuddyProfile(groupId: string): Promise<BuddyProfile | null> {
    const me = this.me()
    if (!me) return delay(null)
    return delay(
      this.db.buddyProfiles.find(
        (b) => b.group_id === groupId && b.profile_id === me.id,
      ) ?? null,
    )
  }

  upsertMyBuddyProfile(groupId: string, input: BuddyProfileInput): Promise<BuddyProfile> {
    const me = this.requireMe()
    let bp = this.db.buddyProfiles.find(
      (b) => b.group_id === groupId && b.profile_id === me.id,
    )
    if (!bp) {
      bp = emptyBuddy(groupId, me.id, input.preferred_name)
      this.db.buddyProfiles.push(bp)
    }
    Object.assign(bp, input, { updated_at: nowIso() })
    // Mark membership complete (has a drink + at least one signal).
    const member = this.db.members.find(
      (m) => m.group_id === groupId && m.profile_id === me.id,
    )
    if (member) {
      member.profile_complete =
        !!input.drink.trim() &&
        (input.interests.length > 0 ||
          input.favourite_snacks.length > 0 ||
          input.little_things.trim().length > 0)
    }
    this.persist()
    return delay(bp)
  }

  async getMyBuddy(groupId: string): Promise<BuddyProfile | null> {
    const receiverId = await this.getMyReceiverId(groupId)
    if (!receiverId) return null
    return (
      this.db.buddyProfiles.find(
        (b) => b.group_id === groupId && b.profile_id === receiverId,
      ) ?? emptyBuddy(groupId, receiverId, this.nameOf(receiverId))
    )
  }

  private nameOf(profileId: string): string {
    return this.db.profiles.find((p) => p.id === profileId)?.display_name ?? 'Your buddy'
  }

  // --- Exclusions ---
  listExclusions(groupId: string): Promise<Exclusion[]> {
    return delay(this.db.exclusions.filter((e) => e.group_id === groupId))
  }

  addExclusion(
    groupId: string,
    giverId: string,
    receiverId: string,
    reason?: string,
  ): Promise<Exclusion> {
    const ex: Exclusion = {
      id: uid('exc-'),
      group_id: groupId,
      giver_id: giverId,
      receiver_id: receiverId,
      reason: reason ?? null,
      created_at: nowIso(),
    }
    this.db.exclusions.push(ex)
    this.persist()
    return delay(ex)
  }

  removeExclusion(groupId: string, exclusionId: string): Promise<void> {
    this.db.exclusions = this.db.exclusions.filter(
      (e) => !(e.id === exclusionId && e.group_id === groupId),
    )
    this.persist()
    return delay(undefined)
  }

  // --- Draw (privileged) ---
  async runDraw(groupId: string): Promise<RunDrawResult> {
    const me = this.requireMe()
    const g = this.group(groupId)
    if (!g) throw new Error('Group not found.')
    if (g.organiser_id !== me.id) throw new Error('Only the organiser can run the draw.')

    // Idempotency: never silently redraw once drawn.
    if (g.status === 'drawn' || g.status === 'revealed') {
      const existing = this.db.assignments.filter((a) => a.group_id === groupId)
      return delay({ count: existing.length, reciprocalCount: 0 })
    }

    const participants = this.db.members
      .filter((m) => m.group_id === groupId)
      .map((m) => ({ id: m.profile_id }))
    const exclusions = this.db.exclusions
      .filter((e) => e.group_id === groupId)
      .map((e) => ({ giver_id: e.giver_id, receiver_id: e.receiver_id }))

    // Deterministic seed from group id (stable across retries of the same group).
    const seed = [...groupId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
    const result = computeDraw(participants, exclusions, { seed })

    const check = validateDraw(participants, result.pairs, exclusions)
    if (!check.valid) throw new Error('Draw failed validation: ' + check.errors.join('; '))

    // Transactional in spirit: build the full set, then commit at once.
    const created = result.pairs.map((p, i) => ({
      id: `asg-${groupId}-${i}`,
      group_id: groupId,
      giver_id: p.giver_id,
      receiver_id: p.receiver_id,
      created_at: nowIso(),
    }))
    this.db.assignments = [
      ...this.db.assignments.filter((a) => a.group_id !== groupId),
      ...created,
    ]
    g.status = 'drawn'
    g.draw_at = nowIso()
    this.persist()
    return delay({ count: created.length, reciprocalCount: result.reciprocalCount })
  }

  getMyReceiverId(groupId: string): Promise<string | null> {
    const me = this.me()
    if (!me) return delay(null)
    const a = this.db.assignments.find(
      (x) => x.group_id === groupId && x.giver_id === me.id,
    )
    return delay(a?.receiver_id ?? null)
  }

  hasRevealed(groupId: string): Promise<boolean> {
    return delay(!!this.db.revealed[groupId])
  }

  markRevealed(groupId: string): Promise<void> {
    this.db.revealed[groupId] = true
    this.persist()
    return delay(undefined)
  }

  // --- Anonymous questions ---
  async askQuestion(groupId: string, question: string): Promise<AnonymousQuestion> {
    const me = this.requireMe()
    const receiverId = await this.getMyReceiverId(groupId)
    if (!receiverId) throw new Error('You can only ask your assigned buddy.')
    const q: AnonymousQuestion = {
      id: uid('q-'),
      group_id: groupId,
      sender_id: me.id,
      recipient_id: receiverId,
      question: question.trim(),
      answer: null,
      status: 'pending',
      created_at: nowIso(),
      answered_at: null,
    }
    this.db.questions.push(q)
    this.persist()
    return delay(q)
  }

  listQuestionsIAsked(groupId: string): Promise<AnonymousQuestion[]> {
    const me = this.me()
    if (!me) return delay([])
    return delay(
      this.db.questions
        .filter((q) => q.group_id === groupId && q.sender_id === me.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    )
  }

  listQuestionsForMe(groupId: string): Promise<ReceivedQuestion[]> {
    const me = this.me()
    if (!me) return delay([])
    // Strip sender_id — the recipient must never learn who asked.
    return delay(
      this.db.questions
        .filter((q) => q.group_id === groupId && q.recipient_id === me.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(({ sender_id: _omit, ...rest }) => rest),
    )
  }

  answerQuestion(questionId: string, answer: string): Promise<void> {
    const me = this.requireMe()
    const q = this.db.questions.find((x) => x.id === questionId)
    if (!q) throw new Error('Question not found.')
    if (q.recipient_id !== me.id) throw new Error('You can only answer your own questions.')
    q.answer = answer.trim()
    q.status = 'answered'
    q.answered_at = nowIso()
    this.persist()
    return delay(undefined)
  }

  // --- Missions ---
  listMissions(groupId: string): Promise<Mission[]> {
    return delay(
      this.db.missions
        .filter((m) => m.group_id === groupId)
        .sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? '')),
    )
  }

  currentMission(groupId: string): Promise<Mission | null> {
    const missions = this.db.missions.filter((m) => m.group_id === groupId)
    // Prefer the most recent one that has started.
    const sorted = missions.sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? ''))
    return delay(sorted[0] ?? null)
  }

  createMission(
    groupId: string,
    input: Omit<Mission, 'id' | 'group_id' | 'created_at'>,
  ): Promise<Mission> {
    const mission: Mission = {
      id: uid('mis-'),
      group_id: groupId,
      created_at: nowIso(),
      ...input,
    }
    this.db.missions.push(mission)
    this.persist()
    return delay(mission)
  }

  // --- Inbox (derived) ---
  async listInbox(groupId: string): Promise<InboxItem[]> {
    const me = this.me()
    if (!me) return []
    const items: InboxItem[] = []

    for (const q of this.db.questions.filter((x) => x.group_id === groupId)) {
      if (q.sender_id === me.id && q.status === 'answered') {
        items.push({
          id: `inbox-ans-${q.id}`,
          kind: 'question_answered',
          title: `${this.nameOf(q.recipient_id)} answered your question`,
          body: q.answer ?? '',
          created_at: q.answered_at ?? q.created_at,
          read: this.db.readInbox.includes(`inbox-ans-${q.id}`),
          href: '/app/messages',
        })
      }
      if (q.recipient_id === me.id && q.status === 'pending') {
        items.push({
          id: `inbox-recv-${q.id}`,
          kind: 'question_received',
          title: 'Your Secret Buddy asked you something',
          body: q.question,
          created_at: q.created_at,
          read: this.db.readInbox.includes(`inbox-recv-${q.id}`),
          href: '/app/messages',
        })
      }
    }

    const mission = await this.currentMission(groupId)
    if (mission) {
      items.push({
        id: `inbox-mission-${mission.id}`,
        kind: 'new_mission',
        title: `New mission — ${mission.tagline}`,
        body: mission.body,
        created_at: mission.created_at,
        read: this.db.readInbox.includes(`inbox-mission-${mission.id}`),
        href: '/app/missions',
      })
    }

    return items.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  markInboxRead(_groupId: string, itemId: string): Promise<void> {
    if (!this.db.readInbox.includes(itemId)) this.db.readInbox.push(itemId)
    this.persist()
    return delay(undefined)
  }
}
