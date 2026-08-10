import { useNavigate } from 'react-router-dom'
import { VenetianMask } from 'lucide-react'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Chip'
import { ButtonLink } from '@/components/ui/Button'
import { EggMascot } from '@/components/brand/EggMascot'

export function AccompliceScreen() {
  const navigate = useNavigate()
  return (
    <div>
      <ScreenHeader title="Ask an accomplice" onBack={() => navigate(-1)} />
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-tint text-sage-deep">
          <VenetianMask size={26} aria-hidden />
        </span>
        <Badge tone="sage">Coming next</Badge>
        <h1 className="font-display text-2xl text-ink">Recruit a secret helper</h1>
        <p className="max-w-xs text-sm text-ink-muted">
          Soon you’ll be able to quietly rope in a colleague — an “accomplice” — to help pull
          off a surprise: place a treat on the day, keep a secret, or find out a detail.
        </p>
      </div>

      <Card tone="cream">
        <CardBody className="flex items-center gap-4">
          <EggMascot mood="peek" className="h-16 w-16" />
          <div>
            <p className="font-semibold text-ink">We’re still cracking on with this one.</p>
            <p className="text-sm text-ink-muted">
              The groundwork is in place — it’ll arrive without any fuss.
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="mt-5">
        <ButtonLink to="/app/ideas" fullWidth>
          Get a surprise idea instead
        </ButtonLink>
      </div>
    </div>
  )
}
