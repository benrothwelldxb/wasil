import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { MissionCard } from './MissionCard'
import { EmptyState, Loading, SectionLabel } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useMissions } from '@/data/hooks'
import { formatDate } from '@/lib/utils'

export function MissionsScreen() {
  const { groupId, loading } = useActiveGroup()
  const missions = useMissions(groupId)

  if (loading || missions.isLoading) return <Loading />

  const list = missions.data ?? []
  const [current, ...past] = list

  return (
    <div>
      <ScreenHeader title="Missions" onBack={undefined} />
      <p className="mb-4 px-1 text-sm text-ink-muted">
        Optional group challenges — a nudge to do something lovely. Never tracked, never scored.
      </p>

      {!current ? (
        <EmptyState title="No missions yet" body="Your organiser will pop the odd optional mission here." />
      ) : (
        <div className="space-y-5">
          <MissionCard mission={current} />

          {past.length > 0 && (
            <section className="space-y-2">
              <SectionLabel className="px-1">Past missions</SectionLabel>
              {past.map((m) => (
                <Card key={m.id}>
                  <CardBody className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{m.title}</p>
                      <p className="text-sm text-ink-muted">{m.tagline}</p>
                    </div>
                    <span className="text-xs text-ink-faint">{formatDate(m.starts_at)}</span>
                  </CardBody>
                </Card>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
