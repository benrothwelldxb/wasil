import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, Wallet } from 'lucide-react';
import type { Journey } from '@/domain/types';
import { formatDuration, formatMoney, formatPercent, formatTime } from '@/domain/format';
import { criteriaToJourneyPath } from '@/domain/url';
import { Card } from '@/components/ui/card';
import { ExperienceRing } from '@/components/shared/ExperienceRing';
import { RouteGlyph } from './RouteGlyph';
import { BadgeChip } from './journey-badges';

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export function JourneyCard({ journey }: { journey: Journey }) {
  const firstLeg = journey.legs[0];
  const lastLeg = journey.legs[journey.legs.length - 1];
  const headroomPct = Math.round(journey.cost.headroomPct * 100);

  return (
    <motion.div variants={cardVariants} layout>
      <Link
        to={criteriaToJourneyPath(journey.id, journey.criteria)}
        className="group block focus-visible:outline-none"
      >
        <Card className="overflow-hidden p-5 transition-all group-hover:border-primary/40 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              {journey.badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {journey.badges.map((b) => (
                    <BadgeChip key={b} badge={b} />
                  ))}
                </div>
              )}

              <RouteGlyph journey={journey} />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(journey.totalTravelTimeMinutes)} flying
                </span>
                <span>
                  {formatTime(firstLeg.departure)} → {formatTime(lastLeg.arrival)}
                </span>
                <span className="truncate">{firstLeg.airline.name}</span>
              </div>

              <p className="text-sm text-foreground/80">{journey.score.narrative}</p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <ExperienceRing score={journey.score.total} />
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4 border-t pt-4">
            <div>
              <div className="text-2xl font-bold">{formatMoney(journey.cost.total)}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wallet className="h-3 w-3" />
                {formatMoney(journey.cost.headroom)} under budget ({formatPercent(
                  journey.cost.headroomPct,
                )})
              </div>
              <div className="mt-1.5 h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${100 - headroomPct}%` }}
                />
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              View journey
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
