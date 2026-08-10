import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { provider, type BuddyProfileInput, type CreateGroupInput } from './index'
import type { GroupStatus, Mission } from '@/lib/types'
import { useSession } from '@/store/session'

/** Central query-key factory. */
export const qk = {
  me: ['me'] as const,
  memberships: ['memberships'] as const,
  group: (id: string) => ['group', id] as const,
  membership: (id: string) => ['membership', id] as const,
  participants: (id: string) => ['participants', id] as const,
  myProfile: (id: string) => ['buddyProfile', id] as const,
  myBuddy: (id: string) => ['myBuddy', id] as const,
  receiver: (id: string) => ['receiver', id] as const,
  revealed: (id: string) => ['revealed', id] as const,
  missions: (id: string) => ['missions', id] as const,
  mission: (id: string) => ['currentMission', id] as const,
  inbox: (id: string) => ['inbox', id] as const,
  asked: (id: string) => ['asked', id] as const,
  forMe: (id: string) => ['forMe', id] as const,
  exclusions: (id: string) => ['exclusions', id] as const,
}

// --- Queries ---
export const useCurrentProfile = () =>
  useQuery({ queryKey: qk.me, queryFn: () => provider.currentProfile() })

export const useMemberships = () =>
  useQuery({ queryKey: qk.memberships, queryFn: () => provider.listMyMemberships() })

export const useGroup = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.group(id) : ['group', 'none'],
    queryFn: () => provider.getGroup(id!),
    enabled: !!id,
  })

export const useMyMembership = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.membership(id) : ['membership', 'none'],
    queryFn: () => provider.getMyMembership(id!),
    enabled: !!id,
  })

export const useParticipants = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.participants(id) : ['participants', 'none'],
    queryFn: () => provider.listParticipants(id!),
    enabled: !!id,
  })

export const useMyBuddyProfile = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.myProfile(id) : ['buddyProfile', 'none'],
    queryFn: () => provider.getMyBuddyProfile(id!),
    enabled: !!id,
  })

export const useMyBuddy = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.myBuddy(id) : ['myBuddy', 'none'],
    queryFn: () => provider.getMyBuddy(id!),
    enabled: !!id,
  })

export const useReceiverId = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.receiver(id) : ['receiver', 'none'],
    queryFn: () => provider.getMyReceiverId(id!),
    enabled: !!id,
  })

export const useHasRevealed = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.revealed(id) : ['revealed', 'none'],
    queryFn: () => provider.hasRevealed(id!),
    enabled: !!id,
  })

export const useMissions = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.missions(id) : ['missions', 'none'],
    queryFn: () => provider.listMissions(id!),
    enabled: !!id,
  })

export const useCurrentMission = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.mission(id) : ['currentMission', 'none'],
    queryFn: () => provider.currentMission(id!),
    enabled: !!id,
  })

export const useInbox = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.inbox(id) : ['inbox', 'none'],
    queryFn: () => provider.listInbox(id!),
    enabled: !!id,
  })

export const useQuestionsIAsked = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.asked(id) : ['asked', 'none'],
    queryFn: () => provider.listQuestionsIAsked(id!),
    enabled: !!id,
  })

export const useQuestionsForMe = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.forMe(id) : ['forMe', 'none'],
    queryFn: () => provider.listQuestionsForMe(id!),
    enabled: !!id,
  })

export const useExclusions = (id: string | null) =>
  useQuery({
    queryKey: id ? qk.exclusions(id) : ['exclusions', 'none'],
    queryFn: () => provider.listExclusions(id!),
    enabled: !!id,
  })

// --- Mutations ---
export function useSignIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { email: string; displayName?: string }) =>
      provider.signIn(v.email, v.displayName),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: (v: { email: string; displayName?: string }) =>
      provider.requestOtp(v.email, v.displayName),
  })
}

export function useVerifyOtp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { email: string; code: string }) => provider.verifyOtp(v.email, v.code),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSignOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => provider.signOut(),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: { display_name?: string; avatar_seed?: string }) =>
      provider.updateMyProfile(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateGroupInput) => provider.createGroup(input),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useJoinGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { code: string; displayName: string }) =>
      provider.joinGroup(v.code, v.displayName),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useUpdateGroup(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Parameters<typeof provider.updateGroup>[1]) =>
      provider.updateGroup(groupId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.group(groupId) }),
  })
}

export function useSetGroupStatus(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: GroupStatus) => provider.setGroupStatus(groupId, status),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useUpsertBuddyProfile(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BuddyProfileInput) => provider.upsertMyBuddyProfile(groupId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.myProfile(groupId) })
      qc.invalidateQueries({ queryKey: qk.membership(groupId) })
      qc.invalidateQueries({ queryKey: qk.participants(groupId) })
    },
  })
}

export function useRunDraw(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => provider.runDraw(groupId),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useMarkRevealed(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => provider.markRevealed(groupId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.revealed(groupId) }),
  })
}

export function useAskQuestion(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (question: string) => provider.askQuestion(groupId, question),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.asked(groupId) })
      qc.invalidateQueries({ queryKey: qk.inbox(groupId) })
    },
  })
}

export function useAnswerQuestion(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; answer: string }) =>
      provider.answerQuestion(v.id, v.answer),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.forMe(groupId) })
      qc.invalidateQueries({ queryKey: qk.inbox(groupId) })
    },
  })
}

export function useCreateMission(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<Mission, 'id' | 'group_id' | 'created_at'>) =>
      provider.createMission(groupId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.missions(groupId) }),
  })
}

export function useRemoveParticipant(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memberId: string) => provider.removeParticipant(groupId, memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.participants(groupId) }),
  })
}

export function useMarkInboxRead(groupId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => provider.markInboxRead(groupId, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.inbox(groupId) }),
  })
}

/** Resolve the "active" group: valid session pointer, else first membership. */
export function useActiveGroupId(): { id: string | null; loading: boolean } {
  const pointer = useSession((s) => s.activeGroupId)
  const memberships = useMemberships()
  const list = memberships.data ?? []
  const valid = pointer && list.some((m) => m.group.id === pointer) ? pointer : null
  const id = valid ?? list[0]?.group.id ?? null
  return { id, loading: memberships.isLoading }
}

export type { UseQueryResult }
