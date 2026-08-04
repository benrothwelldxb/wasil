import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, Route } from 'lucide-react';
import { applyHotelChoice } from '@/domain/scoring';
import type { Journey } from '@/domain/types';
import { formatMoney, formatSpan } from '@/domain/format';
import { track } from '@/lib/analytics';
import { useCriteriaFromParams } from '@/hooks/use-criteria-from-params';
import { useJourney } from '@/hooks/use-journey';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ExperienceRing } from '@/components/shared/ExperienceRing';
import { ErrorState } from '@/components/shared/StateViews';
import { BadgeChip } from '@/features/results/journey-badges';
import { RouteGlyph } from '@/features/results/RouteGlyph';
import { ItineraryTimeline } from './ItineraryTimeline';
import { StopoverStory } from './StopoverStory';
import { StopoverInsights } from './StopoverInsights';
import { CostBreakdownPanel } from './CostBreakdownPanel';
import { ScoreExplainer } from './ScoreExplainer';
import { JourneyScorePanel } from './JourneyScorePanel';

export function JourneyDetailPage() {
  const { journeyId = '' } = useParams();
  const { criteria } = useCriteriaFromParams();
  const navigate = useNavigate();
  const query = useJourney(journeyId, criteria);

  const [journey, setJourney] = useState<Journey | null>(null);
  useEffect(() => {
    if (query.data) {
      setJourney(query.data);
      track({
        name: 'journey_viewed',
        journeyId: query.data.id,
        kind: query.data.kind,
        score: query.data.score.total,
      });
    }
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="container max-w-4xl space-y-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || (query.isSuccess && !journey)) {
    return (
      <div className="container py-10">
        <ErrorState message="We couldn't find that journey. It may have expired." />
      </div>
    );
  }

  if (!journey) return null;

  const handleHotelChange = (hotelId: string) => {
    const swappedCity = journey.stopovers.find(
      (s) => s.hotel.id === hotelId || s.alternativeHotels.some((h) => h.id === hotelId),
    );
    if (swappedCity) {
      track({ name: 'hotel_swapped', journeyId: journey.id, cityIata: swappedCity.airport.iata });
    }
    setJourney((current) => (current ? applyHotelChoice(current, hotelId) : current));
  };

  return (
    <div className="container max-w-4xl py-8">
      <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" />
        Back to results
      </Button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Card className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              {journey.badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {journey.badges.map((b) => (
                    <BadgeChip key={b} badge={b} />
                  ))}
                </div>
              )}
              <RouteGlyph journey={journey} className="text-base" />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Route className="h-4 w-4" />
                  {journey.kind === 'direct' ? 'Direct' : `${journey.stopovers.length}-stop journey`}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatSpan(journey.doorToDoorMinutes)} door to door
                </span>
              </div>
              <p className="max-w-xl text-foreground/80">{journey.score.narrative}</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ExperienceRing score={journey.score.total} size={92} strokeWidth={8} />
              <div className="text-center">
                <div className="text-2xl font-bold">{formatMoney(journey.cost.total)}</div>
                <div className="text-xs text-muted-foreground">total trip</div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Your itinerary</h2>
            <ItineraryTimeline journey={journey} />
          </Card>

          {journey.stopovers.map((stopover, i) => (
            <div key={stopover.airport.iata} className="space-y-6">
              <StopoverStory stopover={stopover} onHotelChange={handleHotelChange} />
              <StopoverInsights
                cityIata={stopover.airport.iata}
                cityName={stopover.cityName}
                nights={stopover.nights}
                pax={journey.criteria.pax}
                // Check-in date at this stopover = arrival of the leg into it,
                // so seasonal weather reflects the actual stay, not departure day.
                date={journey.legs[i]?.arrival.slice(0, 10) ?? journey.criteria.departureDate}
              />
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="lg:sticky lg:top-20 lg:space-y-6">
            <CostBreakdownPanel cost={journey.cost} />
            <Card className="p-5">
              <ScoreExplainer score={journey.score} />
            </Card>
            <JourneyScorePanel journey={journey} />
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() =>
                    track({
                      name: 'booking_intent',
                      journeyId: journey.id,
                      kind: journey.kind,
                      totalUsd: journey.cost.total.amount,
                    })
                  }
                >
                  Book this journey
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Demo build</DialogTitle>
                  <DialogDescription>
                    RouteCraft is a portfolio demo powered by a synthetic journey engine. Booking
                    and payment are intentionally out of scope — the focus is the discovery and
                    ranking experience.
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
