import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/states'
import { GhostArt } from '@/components/brand/illustrations'
import { EggMascot } from '@/components/brand/EggMascot'
import type { Mission } from '@/lib/types'

const toneFor: Record<Mission['accent'], 'sage' | 'lilac' | 'peach' | 'yolk' | 'coral'> = {
  sage: 'sage',
  lilac: 'lilac',
  peach: 'peach',
  yolk: 'yolk',
  coral: 'coral',
}

function isSpooky(m: Mission): boolean {
  return /spook|hallow|ghost|october/i.test(`${m.title} ${m.tagline} ${m.body}`)
}

export function MissionCard({ mission }: { mission: Mission }) {
  const navigate = useNavigate()
  return (
    <Card tone={toneFor[mission.accent]}>
      <CardBody className="relative overflow-hidden">
        <div className="max-w-[62%] space-y-2">
          <SectionLabel>Mission</SectionLabel>
          <h3 className="font-display text-2xl leading-tight text-ink">{mission.title}</h3>
          <p className="font-semibold text-ink">{mission.tagline}</p>
          <p className="text-sm text-ink-soft">{mission.body}</p>
          <Button size="sm" onClick={() => navigate('/app/ideas')} className="mt-1">
            Give me an idea <ArrowRight size={16} aria-hidden />
          </Button>
        </div>
        <div className="pointer-events-none absolute -bottom-2 right-1 w-28">
          {isSpooky(mission) ? <GhostArt className="h-28 w-28" /> : <EggMascot mood="happy" className="h-24 w-24" />}
        </div>
      </CardBody>
    </Card>
  )
}
