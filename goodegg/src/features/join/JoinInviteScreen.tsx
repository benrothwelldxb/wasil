import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardBody } from '@/components/ui/Card'
import { TextInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { EggMascot } from '@/components/brand/EggMascot'
import { Loading } from '@/components/ui/states'
import { provider } from '@/data'
import { useCurrentProfile, useJoinGroup } from '@/data/hooks'
import { useSession } from '@/store/session'
import type { Group } from '@/lib/types'

export function JoinInviteScreen() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const join = useJoinGroup()
  const me = useCurrentProfile()
  const setActiveGroup = useSession((s) => s.setActiveGroup)

  const [group, setGroup] = useState<Group | null | 'loading'>('loading')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    provider.getGroupByCode(code).then((g) => setGroup(g))
  }, [code])

  useEffect(() => {
    if (me.data?.display_name && !name) setName(me.data.display_name)
  }, [me.data, name])

  if (group === 'loading' || me.isLoading) return <div className="mx-auto max-w-app"><Loading /></div>

  if (!group) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-4 bg-cream-100 px-8 text-center">
        <EggMascot mood="sleepy" className="h-24 w-24" />
        <h1 className="font-display text-2xl text-ink">Hmm, no group here</h1>
        <p className="text-ink-muted">The code <b>{code}</b> didn’t match a group. Double-check it with your organiser.</p>
        <Button onClick={() => navigate('/join')}>Try another code</Button>
      </div>
    )
  }

  const needsSignIn = provider.kind !== 'local' && !me.data

  async function onJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (needsSignIn) {
      navigate(`/signin?next=${encodeURIComponent(`/join/${code}`)}`)
      return
    }
    if (!name.trim()) return
    try {
      const { group: joined } = await join.mutateAsync({ code, displayName: name.trim() })
      setActiveGroup(joined.id)
      navigate(`/onboard/${joined.id}/profile`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the group.')
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-app bg-cream-100 px-5 safe-top safe-bottom">
      <div className="flex flex-col items-center gap-3 pt-12 text-center">
        <EggMascot mood="peek" className="h-28 w-28" />
        <p className="text-lg">You’ve been invited 👀</p>
        <h1 className="font-display text-4xl text-ink">{group.name}</h1>
        <p className="max-w-xs text-ink-muted">A year of little anonymous surprises.</p>
      </div>

      <Card tone="cream" className="mt-8">
        <CardBody>
          <form onSubmit={onJoin} className="space-y-4">
            {!needsSignIn && (
              <TextInput
                label="Your name"
                hint="This is how your buddy will know you."
                placeholder="e.g. Sam"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            )}
            {error && <p className="text-sm text-coral-deep">{error}</p>}
            <Button type="submit" size="lg" fullWidth disabled={(!needsSignIn && !name.trim()) || join.isPending}>
              {needsSignIn ? 'Sign in to join' : 'Join the group'}
            </Button>
            {needsSignIn && (
              <p className="text-center text-xs text-ink-muted">
                We’ll email you a 6-digit code — no password needed.
              </p>
            )}
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
