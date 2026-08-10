/**
 * SupabaseProvider — the production backend path.
 *
 * Talks to Supabase Postgres + Auth + RLS and the privileged `run-draw` edge
 * function. Secrecy is enforced by the database, not here:
 *   • "my buddy" is read via the SECURITY DEFINER RPC `my_buddy_profile()`
 *   • the assignments table has NO select policy for anyone
 *   • received questions come from a view that omits the asker
 *
 * This provider is only loaded when VITE_DATA_PROVIDER=supabase. It is written
 * against the schema in /supabase/migrations. Rows are cast to domain types.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`)
  return value
}

export class SupabaseProvider implements DataProvider {
  readonly kind = 'supabase' as const
  private sb: SupabaseClient

  constructor() {
    const url = required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL)
    const key = required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY)
    this.sb = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }

  private async uid(): Promise<string | null> {
    const { data } = await this.sb.auth.getUser()
    return data.user?.id ?? null
  }

  private unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
    if (res.error) throw new Error(res.error.message)
    return res.data as T
  }

  // --- Auth ---
  async currentProfile(): Promise<Profile | null> {
    const id = await this.uid()
    if (!id) return null
    const res = await this.sb.from('profiles').select('*').eq('id', id).maybeSingle()
    return this.unwrap(res) as Profile | null
  }

  async signIn(email: string, displayName?: string): Promise<Profile> {
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
        data: displayName ? { display_name: displayName } : undefined,
      },
    })
    if (error) throw new Error(error.message)
    // Magic-link flow: the profile resolves after the user follows the link.
    // Return a provisional profile so the UI can show a "check your email" state.
    return {
      id: 'pending',
      display_name: displayName ?? email,
      email,
      avatar_seed: null,
      created_at: new Date().toISOString(),
    }
  }

  async requestOtp(email: string, displayName?: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: displayName ? { display_name: displayName } : undefined,
      },
    })
    if (error) throw new Error(error.message)
  }

  async verifyOtp(email: string, code: string): Promise<Profile> {
    const { error } = await this.sb.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) throw new Error(error.message)
    const profile = await this.currentProfile()
    if (!profile) throw new Error('Signed in, but no profile was found.')
    return profile
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut()
  }

  async updateMyProfile(
    patch: Partial<Pick<Profile, 'display_name' | 'avatar_seed'>>,
  ): Promise<Profile> {
    const id = await this.uid()
    if (!id) throw new Error('Not signed in.')
    const res = await this.sb.from('profiles').update(patch).eq('id', id).select('*').single()
    return this.unwrap(res) as Profile
  }

  // --- Groups ---
  async createGroup(input: CreateGroupInput): Promise<Group> {
    // organiser display name is applied to the profile; group created via RPC
    // so the organiser membership is created atomically.
    const res = await this.sb.rpc('create_group', {
      p_name: input.name,
      p_description: input.description ?? null,
      p_organiser_name: input.organiser_name,
      p_reveal_date: input.reveal_date ?? null,
      p_suggested_budget: input.suggested_budget ?? null,
    })
    return this.unwrap(res) as Group
  }

  async getGroup(groupId: string): Promise<Group | null> {
    const res = await this.sb.from('groups').select('*').eq('id', groupId).maybeSingle()
    return this.unwrap(res) as Group | null
  }

  async getGroupByCode(code: string): Promise<Group | null> {
    const res = await this.sb.rpc('group_by_code', { p_code: code.toUpperCase() })
    const rows = this.unwrap(res) as Group[]
    return rows[0] ?? null
  }

  async updateGroup(
    groupId: string,
    patch: Partial<Pick<Group, 'name' | 'description' | 'reveal_date' | 'suggested_budget'>>,
  ): Promise<Group> {
    const res = await this.sb.from('groups').update(patch).eq('id', groupId).select('*').single()
    return this.unwrap(res) as Group
  }

  async setGroupStatus(groupId: string, status: GroupStatus): Promise<Group> {
    const res = await this.sb
      .from('groups')
      .update({ status })
      .eq('id', groupId)
      .select('*')
      .single()
    return this.unwrap(res) as Group
  }

  async listMyMemberships(): Promise<Membership[]> {
    const res = await this.sb.from('group_members').select('*, group:groups(*)')
    const rows = this.unwrap(res) as (GroupMember & { group: Group })[]
    return rows.map(({ group, ...member }) => ({ group, member }))
  }

  // --- Membership ---
  async joinGroup(code: string, displayName: string): Promise<Membership> {
    const res = await this.sb.rpc('join_group', {
      p_code: code.toUpperCase(),
      p_display_name: displayName,
    })
    const row = this.unwrap(res) as GroupMember & { group: Group }
    const { group, ...member } = row
    return { group, member }
  }

  async getMyMembership(groupId: string): Promise<GroupMember | null> {
    const id = await this.uid()
    if (!id) return null
    const res = await this.sb
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .eq('profile_id', id)
      .maybeSingle()
    return this.unwrap(res) as GroupMember | null
  }

  async listParticipants(groupId: string): Promise<ParticipantSummary[]> {
    const res = await this.sb.rpc('participant_summaries', { p_group: groupId })
    return this.unwrap(res) as ParticipantSummary[]
  }

  async removeParticipant(groupId: string, memberId: string): Promise<void> {
    const res = await this.sb
      .from('group_members')
      .delete()
      .eq('id', memberId)
      .eq('group_id', groupId)
    if (res.error) throw new Error(res.error.message)
  }

  // --- Buddy profile ---
  async getMyBuddyProfile(groupId: string): Promise<BuddyProfile | null> {
    const id = await this.uid()
    if (!id) return null
    const res = await this.sb
      .from('buddy_profiles')
      .select('*')
      .eq('group_id', groupId)
      .eq('profile_id', id)
      .maybeSingle()
    return this.unwrap(res) as BuddyProfile | null
  }

  async upsertMyBuddyProfile(
    groupId: string,
    input: BuddyProfileInput,
  ): Promise<BuddyProfile> {
    const id = await this.uid()
    if (!id) throw new Error('Not signed in.')
    const row = { ...input, group_id: groupId, profile_id: id, updated_at: new Date().toISOString() }
    const res = await this.sb
      .from('buddy_profiles')
      .upsert(row, { onConflict: 'group_id,profile_id' })
      .select('*')
      .single()
    return this.unwrap(res) as BuddyProfile
  }

  async getMyBuddy(groupId: string): Promise<BuddyProfile | null> {
    // SECURITY DEFINER RPC — the only read path to the receiver's profile.
    const res = await this.sb.rpc('my_buddy_profile', { p_group: groupId })
    const rows = this.unwrap(res) as BuddyProfile[]
    return rows[0] ?? null
  }

  // --- Exclusions ---
  async listExclusions(groupId: string): Promise<Exclusion[]> {
    const res = await this.sb.from('exclusions').select('*').eq('group_id', groupId)
    return this.unwrap(res) as Exclusion[]
  }

  async addExclusion(
    groupId: string,
    giverId: string,
    receiverId: string,
    reason?: string,
  ): Promise<Exclusion> {
    const res = await this.sb
      .from('exclusions')
      .insert({ group_id: groupId, giver_id: giverId, receiver_id: receiverId, reason: reason ?? null })
      .select('*')
      .single()
    return this.unwrap(res) as Exclusion
  }

  async removeExclusion(groupId: string, exclusionId: string): Promise<void> {
    const res = await this.sb
      .from('exclusions')
      .delete()
      .eq('id', exclusionId)
      .eq('group_id', groupId)
    if (res.error) throw new Error(res.error.message)
  }

  // --- Draw (privileged edge function) ---
  async runDraw(groupId: string): Promise<RunDrawResult> {
    const { data, error } = await this.sb.functions.invoke('run-draw', {
      body: { group_id: groupId },
    })
    if (error) throw new Error(error.message)
    return data as RunDrawResult
  }

  async getMyReceiverId(groupId: string): Promise<string | null> {
    const res = await this.sb.rpc('my_assignment', { p_group: groupId })
    const rows = this.unwrap(res) as { receiver_id: string }[]
    return rows[0]?.receiver_id ?? null
  }

  async hasRevealed(groupId: string): Promise<boolean> {
    const id = await this.uid()
    if (!id) return false
    const res = await this.sb
      .from('group_members')
      .select('revealed_at')
      .eq('group_id', groupId)
      .eq('profile_id', id)
      .maybeSingle()
    const row = this.unwrap(res) as { revealed_at: string | null } | null
    return !!row?.revealed_at
  }

  async markRevealed(groupId: string): Promise<void> {
    const res = await this.sb.rpc('mark_revealed', { p_group: groupId })
    if (res.error) throw new Error(res.error.message)
  }

  // --- Anonymous questions ---
  async askQuestion(groupId: string, question: string): Promise<AnonymousQuestion> {
    const res = await this.sb.rpc('ask_buddy', { p_group: groupId, p_question: question })
    return this.unwrap(res) as AnonymousQuestion
  }

  async listQuestionsIAsked(groupId: string): Promise<AnonymousQuestion[]> {
    const id = await this.uid()
    if (!id) return []
    const res = await this.sb
      .from('anonymous_questions')
      .select('*')
      .eq('group_id', groupId)
      .eq('sender_id', id)
      .order('created_at', { ascending: false })
    return this.unwrap(res) as AnonymousQuestion[]
  }

  async listQuestionsForMe(groupId: string): Promise<ReceivedQuestion[]> {
    // From the sender-stripped view enforced by RLS.
    const res = await this.sb
      .from('question_inbox')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
    return this.unwrap(res) as ReceivedQuestion[]
  }

  async answerQuestion(questionId: string, answer: string): Promise<void> {
    const res = await this.sb.rpc('answer_question', { p_question: questionId, p_answer: answer })
    if (res.error) throw new Error(res.error.message)
  }

  // --- Missions ---
  async listMissions(groupId: string): Promise<Mission[]> {
    const res = await this.sb
      .from('missions')
      .select('*')
      .eq('group_id', groupId)
      .order('starts_at', { ascending: false })
    return this.unwrap(res) as Mission[]
  }

  async currentMission(groupId: string): Promise<Mission | null> {
    const missions = await this.listMissions(groupId)
    return missions[0] ?? null
  }

  async createMission(
    groupId: string,
    input: Omit<Mission, 'id' | 'group_id' | 'created_at'>,
  ): Promise<Mission> {
    const res = await this.sb
      .from('missions')
      .insert({ ...input, group_id: groupId })
      .select('*')
      .single()
    return this.unwrap(res) as Mission
  }

  // --- Inbox ---
  async listInbox(groupId: string): Promise<InboxItem[]> {
    const res = await this.sb.rpc('inbox', { p_group: groupId })
    return this.unwrap(res) as InboxItem[]
  }

  async markInboxRead(groupId: string, itemId: string): Promise<void> {
    const res = await this.sb.rpc('mark_inbox_read', { p_group: groupId, p_item: itemId })
    if (res.error) throw new Error(res.error.message)
  }
}
