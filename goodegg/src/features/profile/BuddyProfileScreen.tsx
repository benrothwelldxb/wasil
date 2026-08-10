import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Button } from '@/components/ui/Button'
import { Loading, Spinner } from '@/components/ui/states'
import { BuddyProfileForm, toInput } from './BuddyProfileForm'
import { useCurrentProfile, useMyBuddyProfile, useUpsertBuddyProfile } from '@/data/hooks'
import type { BuddyProfileInput } from '@/data'

export function BuddyProfileScreen({ mode }: { mode: 'onboard' | 'edit' }) {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const me = useCurrentProfile()
  const existing = useMyBuddyProfile(groupId)
  const upsert = useUpsertBuddyProfile(groupId)

  const [value, setValue] = useState<BuddyProfileInput | null>(null)

  useEffect(() => {
    if (!existing.isLoading && value === null) {
      setValue(toInput(me.data?.display_name ?? '', existing.data ?? null))
    }
  }, [existing.isLoading, existing.data, me.data, value])

  if (existing.isLoading || value === null) {
    return <div className="mx-auto max-w-app"><Loading label="Getting your profile…" /></div>
  }

  async function save() {
    if (!value) return
    await upsert.mutateAsync(value)
    navigate('/app')
  }

  return (
    <div className="mx-auto min-h-dvh max-w-app bg-cream-100 px-4 pb-28 safe-top">
      <ScreenHeader
        title={mode === 'onboard' ? 'Your Buddy Profile' : 'Edit profile'}
        onBack={() => (mode === 'onboard' ? navigate('/app') : navigate(-1))}
      />
      <div className="mb-4 px-1">
        <h2 className="font-display text-2xl text-ink">The little things you love</h2>
        <p className="text-sm text-ink-muted">
          Takes 2–3 minutes. Your secret buddy will use this to surprise you — so have fun with it.
        </p>
      </div>

      <BuddyProfileForm value={value} onChange={setValue} />

      {/* Sticky save */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-app border-t border-cream-300 bg-cream-50/95 px-4 py-3 backdrop-blur safe-bottom">
        <Button size="lg" fullWidth onClick={save} disabled={upsert.isPending}>
          {upsert.isPending ? (
            <Spinner className="border-cream-50/40 border-t-cream-50" />
          ) : mode === 'onboard' ? (
            'All done — I’m in!'
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </div>
  )
}
