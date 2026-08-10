import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Settings } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState, Loading, Spinner } from '@/components/ui/states'
import { BuddyProfileForm, toInput } from './BuddyProfileForm'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useCurrentProfile, useMyBuddyProfile, useUpsertBuddyProfile } from '@/data/hooks'
import type { BuddyProfileInput } from '@/data'

export function ProfileScreen() {
  const me = useCurrentProfile()
  const { groupId, loading } = useActiveGroup()
  const existing = useMyBuddyProfile(groupId)
  const upsert = useUpsertBuddyProfile(groupId ?? '')

  const [value, setValue] = useState<BuddyProfileInput | null>(null)
  const [savedAt, setSavedAt] = useState(false)

  useEffect(() => {
    if (groupId && !existing.isLoading && value === null) {
      setValue(toInput(me.data?.display_name ?? '', existing.data ?? null))
    }
  }, [groupId, existing.isLoading, existing.data, me.data, value])

  if (loading) return <Loading />
  if (!groupId) {
    return (
      <EmptyState
        title="No profile yet"
        body="Join or create a group and your Buddy Profile lives here."
      />
    )
  }
  if (value === null) return <Loading label="Getting your profile…" />

  async function save() {
    if (!value) return
    await upsert.mutateAsync(value)
    setSavedAt(true)
    setTimeout(() => setSavedAt(false), 2500)
  }

  return (
    <div>
      <header className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <Avatar name={me.data?.display_name ?? 'You'} seed={me.data?.avatar_seed} size="lg" />
          <div>
            <h1 className="font-display text-2xl text-ink">{me.data?.display_name ?? 'Your profile'}</h1>
            <p className="text-sm text-ink-muted">Your Buddy Profile</p>
          </div>
        </div>
        <Link
          to="/app/settings"
          aria-label="Settings"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-card"
        >
          <Settings size={20} className="text-ink" aria-hidden />
        </Link>
      </header>

      <p className="mb-4 px-1 text-sm text-ink-muted">
        Update these any time — changes are reflected for your secret buddy right away.
      </p>

      <BuddyProfileForm value={value} onChange={setValue} />

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-cream-300 bg-cream-50/95 px-4 py-3 backdrop-blur safe-bottom">
        <Button size="lg" fullWidth onClick={save} disabled={upsert.isPending}>
          {upsert.isPending ? (
            <Spinner className="border-cream-50/40 border-t-cream-50" />
          ) : savedAt ? (
            <>
              <Check size={18} aria-hidden /> Saved
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
      <div className="h-20" />
    </div>
  )
}
