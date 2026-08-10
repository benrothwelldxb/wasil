import { useActiveGroupId, useGroup, useMyMembership } from '@/data/hooks'
import type { Group, GroupMember } from '@/lib/types'

export interface ActiveGroup {
  groupId: string | null
  group: Group | null
  membership: GroupMember | null
  isOrganiser: boolean
  loading: boolean
}

/** Resolve the participant's current group + their membership in one call. */
export function useActiveGroup(): ActiveGroup {
  const { id, loading: idLoading } = useActiveGroupId()
  const group = useGroup(id)
  const membership = useMyMembership(id)
  return {
    groupId: id,
    group: group.data ?? null,
    membership: membership.data ?? null,
    isOrganiser: !!group.data && !!membership.data && group.data.organiser_id === membership.data.profile_id,
    loading: idLoading || group.isLoading || membership.isLoading,
  }
}
