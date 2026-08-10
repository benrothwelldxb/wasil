/**
 * ApiProvider — talks to the self-hosted Hono API (Railway).
 *
 * Auth is a session cookie set by the server on verifyOtp, so every request
 * uses `credentials: 'include'`. The secrecy model is enforced server-side
 * (see server/repo.ts): assignments are never returned, received questions omit
 * the sender, and the draw is organiser-only.
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
import {
  type BuddyProfileInput,
  type CreateGroupInput,
  type DataProvider,
  type ReceivedQuestion,
  type RunDrawResult,
} from './provider'

const BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `Request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

export class ApiProvider implements DataProvider {
  readonly kind = 'api' as const

  // --- Auth ---
  async currentProfile(): Promise<Profile | null> {
    const { profile } = await req<{ profile: Profile | null }>('GET', '/me')
    return profile
  }
  async signIn(email: string, displayName?: string): Promise<Profile> {
    // Two-step in production; requesting the code is the first step.
    await this.requestOtp(email, displayName)
    return { id: 'pending', display_name: displayName ?? email, email, avatar_seed: null, created_at: new Date().toISOString() }
  }
  async requestOtp(email: string, displayName?: string): Promise<void> {
    await req('POST', '/auth/request', { email, displayName })
  }
  async verifyOtp(email: string, code: string): Promise<Profile> {
    const { profile } = await req<{ profile: Profile }>('POST', '/auth/verify', { email, code })
    return profile
  }
  async signOut(): Promise<void> {
    await req('POST', '/auth/signout')
  }
  async updateMyProfile(patch: Partial<Pick<Profile, 'display_name' | 'avatar_seed'>>): Promise<Profile> {
    const { profile } = await req<{ profile: Profile }>('PATCH', '/me', patch)
    return profile
  }

  // --- Groups ---
  async createGroup(input: CreateGroupInput): Promise<Group> {
    const { group } = await req<{ group: Group }>('POST', '/groups', input)
    return group
  }
  async getGroup(groupId: string): Promise<Group | null> {
    const { group } = await req<{ group: Group | null }>('GET', `/groups/${groupId}`)
    return group
  }
  async getGroupByCode(code: string): Promise<Group | null> {
    const { group } = await req<{ group: Group | null }>('GET', `/groups/by-code/${encodeURIComponent(code)}`)
    return group
  }
  async updateGroup(
    groupId: string,
    patch: Partial<Pick<Group, 'name' | 'description' | 'reveal_date' | 'suggested_budget'>>,
  ): Promise<Group> {
    const { group } = await req<{ group: Group }>('PATCH', `/groups/${groupId}`, patch)
    return group
  }
  async setGroupStatus(groupId: string, status: GroupStatus): Promise<Group> {
    const { group } = await req<{ group: Group }>('POST', `/groups/${groupId}/status`, { status })
    return group
  }
  async listMyMemberships(): Promise<Membership[]> {
    const { memberships } = await req<{ memberships: Membership[] }>('GET', '/memberships')
    return memberships
  }

  // --- Membership ---
  async joinGroup(code: string, displayName: string): Promise<Membership> {
    const { membership } = await req<{ membership: Membership }>('POST', '/join', { code, displayName })
    return membership
  }
  async getMyMembership(groupId: string): Promise<GroupMember | null> {
    const { membership } = await req<{ membership: GroupMember | null }>('GET', `/groups/${groupId}/membership`)
    return membership
  }
  async listParticipants(groupId: string): Promise<ParticipantSummary[]> {
    const { participants } = await req<{ participants: ParticipantSummary[] }>('GET', `/groups/${groupId}/participants`)
    return participants
  }
  async removeParticipant(groupId: string, memberId: string): Promise<void> {
    await req('DELETE', `/groups/${groupId}/participants/${memberId}`)
  }

  // --- Buddy profile ---
  async getMyBuddyProfile(groupId: string): Promise<BuddyProfile | null> {
    const { profile } = await req<{ profile: BuddyProfile | null }>('GET', `/groups/${groupId}/buddy-profile`)
    return profile
  }
  async upsertMyBuddyProfile(groupId: string, input: BuddyProfileInput): Promise<BuddyProfile> {
    const { profile } = await req<{ profile: BuddyProfile }>('PUT', `/groups/${groupId}/buddy-profile`, input)
    return profile
  }
  async getMyBuddy(groupId: string): Promise<BuddyProfile | null> {
    const { buddy } = await req<{ buddy: BuddyProfile | null }>('GET', `/groups/${groupId}/buddy`)
    return buddy
  }

  // --- Exclusions ---
  async listExclusions(groupId: string): Promise<Exclusion[]> {
    const { exclusions } = await req<{ exclusions: Exclusion[] }>('GET', `/groups/${groupId}/exclusions`)
    return exclusions
  }
  async addExclusion(groupId: string, giverId: string, receiverId: string, reason?: string): Promise<Exclusion> {
    const { exclusion } = await req<{ exclusion: Exclusion }>('POST', `/groups/${groupId}/exclusions`, {
      giver_id: giverId,
      receiver_id: receiverId,
      reason,
    })
    return exclusion
  }
  async removeExclusion(groupId: string, exclusionId: string): Promise<void> {
    await req('DELETE', `/groups/${groupId}/exclusions/${exclusionId}`)
  }

  // --- Draw ---
  async runDraw(groupId: string): Promise<RunDrawResult> {
    return req<RunDrawResult>('POST', `/groups/${groupId}/draw`)
  }
  async getMyReceiverId(groupId: string): Promise<string | null> {
    const { receiver_id } = await req<{ receiver_id: string | null }>('GET', `/groups/${groupId}/receiver`)
    return receiver_id
  }
  async hasRevealed(groupId: string): Promise<boolean> {
    const { revealed } = await req<{ revealed: boolean }>('GET', `/groups/${groupId}/revealed`)
    return revealed
  }
  async markRevealed(groupId: string): Promise<void> {
    await req('POST', `/groups/${groupId}/reveal`)
  }

  // --- Questions ---
  async askQuestion(groupId: string, question: string): Promise<AnonymousQuestion> {
    const { question: q } = await req<{ question: AnonymousQuestion }>('POST', `/groups/${groupId}/questions`, {
      question,
    })
    return q
  }
  async listQuestionsIAsked(groupId: string): Promise<AnonymousQuestion[]> {
    const { questions } = await req<{ questions: AnonymousQuestion[] }>('GET', `/groups/${groupId}/questions/asked`)
    return questions
  }
  async listQuestionsForMe(groupId: string): Promise<ReceivedQuestion[]> {
    const { questions } = await req<{ questions: ReceivedQuestion[] }>('GET', `/groups/${groupId}/questions/for-me`)
    return questions
  }
  async answerQuestion(questionId: string, answer: string): Promise<void> {
    await req('POST', `/questions/${questionId}/answer`, { answer })
  }

  // --- Missions ---
  async listMissions(groupId: string): Promise<Mission[]> {
    const { missions } = await req<{ missions: Mission[] }>('GET', `/groups/${groupId}/missions`)
    return missions
  }
  async currentMission(groupId: string): Promise<Mission | null> {
    const { mission } = await req<{ mission: Mission | null }>('GET', `/groups/${groupId}/missions/current`)
    return mission
  }
  async createMission(
    groupId: string,
    input: Omit<Mission, 'id' | 'group_id' | 'created_at'>,
  ): Promise<Mission> {
    const { mission } = await req<{ mission: Mission }>('POST', `/groups/${groupId}/missions`, input)
    return mission
  }

  // --- Inbox ---
  async listInbox(groupId: string): Promise<InboxItem[]> {
    const { inbox } = await req<{ inbox: InboxItem[] }>('GET', `/groups/${groupId}/inbox`)
    return inbox
  }
  async markInboxRead(groupId: string, itemId: string): Promise<void> {
    await req('POST', `/groups/${groupId}/inbox/read`, { itemId })
  }
}
