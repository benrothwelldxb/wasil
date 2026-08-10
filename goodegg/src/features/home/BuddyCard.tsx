import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Gift, Lock } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Chip'
import { buddySummaryTags } from '@/lib/buddy'
import { firstName } from '@/lib/utils'
import type { BuddyProfile } from '@/lib/types'

export function BuddyCard({ buddy }: { buddy: BuddyProfile }) {
  const navigate = useNavigate()
  const name = buddy.preferred_name
  const tags = buddySummaryTags(buddy)

  return (
    <Card tone="cream">
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Badge tone="ink" icon={<Lock size={12} aria-hidden />}>
              Your secret buddy
            </Badge>
            <Link to="/app/buddy" className="mt-2 block">
              <h2 className="accent-underline inline-block font-display text-5xl leading-tight text-ink">
                {name}
              </h2>
            </Link>
          </div>
          <Link to="/app/buddy" aria-label={`View ${name}'s profile`}>
            <Avatar name={name} seed={buddy.profile_id} size="xl" className="ring-4 ring-lilac-soft" />
          </Link>
        </div>

        {tags.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
            {tags.map((t, i) => (
              <span key={t} className="flex items-center gap-2">
                {i > 0 && <span className="text-lilac-deep">•</span>}
                {t}
              </span>
            ))}
          </p>
        )}

        <Button size="lg" fullWidth onClick={() => navigate('/app/ideas')}>
          <Gift size={18} aria-hidden />
          <span className="flex-1 text-left">Surprise {firstName(name)}</span>
          <ArrowRight size={18} aria-hidden />
        </Button>
      </CardBody>
    </Card>
  )
}
