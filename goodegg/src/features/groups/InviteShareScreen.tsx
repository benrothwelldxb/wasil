import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Copy, Maximize2, Share2, X } from 'lucide-react'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { QRCode } from '@/components/ui/QRCode'
import { EnvelopeArt } from '@/components/brand/illustrations'
import { Loading } from '@/components/ui/states'
import { useGroup } from '@/data/hooks'
import { joinUrl } from '@/lib/utils'

export function InviteShareScreen() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const group = useGroup(groupId ?? null)
  const [copied, setCopied] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  if (group.isLoading) return <div className="mx-auto max-w-app"><Loading /></div>
  if (!group.data) {
    return (
      <div className="mx-auto max-w-app p-8 text-center text-ink-muted">Group not found.</div>
    )
  }

  const url = joinUrl(group.data.join_code)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — the link is visible to copy manually */
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${group.data!.name}`,
          text: 'Join our Secret Buddy group on Be a Good Egg 🥚',
          url,
        })
      } catch {
        /* user cancelled */
      }
    } else {
      copy()
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-app bg-cream-100 px-4 safe-top safe-bottom">
      <ScreenHeader
        onBack={() => navigate('/hq')}
        right={
          <button onClick={() => navigate('/hq')} aria-label="Done" className="text-sm font-semibold text-ink-muted">
            Done
          </button>
        }
      />

      <div className="flex flex-col items-center gap-3 pb-4 text-center">
        <EnvelopeArt className="h-28 w-36" />
        <h1 className="font-display text-3xl text-ink">Your group is ready</h1>
        <p className="max-w-xs text-ink-muted">
          Add your teammates and we’ll handle the matching. Share the link or let them scan the code.
        </p>
      </div>

      <Card tone="cream" className="mb-4">
        <CardBody className="flex flex-col items-center gap-4">
          <QRCode value={url} size={200} />
          <button
            onClick={() => setFullscreen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-lilac-deep"
          >
            <Maximize2 size={16} aria-hidden /> Show full screen
          </button>
        </CardBody>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-2xl bg-white p-2 pl-4 shadow-card">
          <span className="flex-1 truncate text-sm text-ink-soft" title={url}>
            {url.replace(/^https?:\/\//, '')}
          </span>
          <Button size="sm" variant="secondary" onClick={copy} aria-label="Copy link">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <Button size="lg" fullWidth onClick={share}>
          <Share2 size={18} aria-hidden /> Share invite
        </Button>
        <p className="text-center text-sm text-ink-muted">
          Join code: <span className="font-mono font-bold tracking-widest text-ink">{group.data.join_code}</span>
        </p>
        <ButtonLink to="/hq" variant="ghost" fullWidth>
          Go to Secret Buddy HQ
        </ButtonLink>
      </div>

      {/* Full-screen QR for presenting on a staffroom screen */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-cream-50 p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Full screen join code"
        >
          <button
            onClick={() => setFullscreen(false)}
            aria-label="Close full screen"
            className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-cream-200 text-ink"
          >
            <X size={22} />
          </button>
          <h2 className="font-display text-3xl text-ink">Scan to join</h2>
          <p className="text-lg text-ink-soft">{group.data.name}</p>
          <QRCode value={url} size={Math.min(360, window.innerWidth - 80)} />
          <p className="text-xl">
            Code: <span className="font-mono font-bold tracking-widest">{group.data.join_code}</span>
          </p>
        </div>
      )}
    </div>
  )
}
