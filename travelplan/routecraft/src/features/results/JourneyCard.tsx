import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BedDouble, MoonStar, Sparkles, Star, Wallet, Zap } from 'lucide-react';
import type { HotelTier, Journey } from '@/domain/types';
import { formatMoney } from '@/domain/format';
import { criteriaToJourneyPath } from '@/domain/url';
import { track } from '@/lib/analytics';
import { getCityWeather } from '@/data/hotels';
import { Card } from '@/components/ui/card';
import { ExperienceRing } from '@/components/shared/ExperienceRing';
import { RouteMap } from './RouteMap';
import { WeatherBadge } from './WeatherBadge';
import { CabinPill, DurationPill, SavingsPill } from './JourneyStatPills';
import { JourneyMiniTimeline } from './JourneyMiniTimeline';
import { BadgeChip } from './journey-badges';

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const HOTEL_TIER_LABEL: Record<HotelTier, string> = {
  budget: 'Budget',
  midscale: 'Midscale',
  upscale: 'Upscale',
};

interface FeaturedCity {
  iata: string;
  cityName: string;
  countryCode: string;
}

let regionNames: Intl.DisplayNames | undefined;
function countryName(code: string): string {
  regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** 'YYYY-MM-DD' → 0–11 (JS `Date#getMonth` convention), parsed without a timezone. */
function monthFromISODate(iso: string): number | undefined {
  const month = Number(iso.slice(5, 7));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : undefined;
}

/** One-word verdict for the score dial — mirrors ExperienceRing's colour bands. */
function scoreBand(score: number): string {
  if (score >= 80) return 'Exceptional';
  if (score >= 60) return 'Great value';
  return 'Fair';
}

/**
 * Immersive, Airbnb-listing-style journey card: a photo-like route map hero
 * with the featured city + weather overlaid, then a body with the journey
 * score, savings, hotel, a compact timeline, and highlights.
 */
export function JourneyCard({ journey, rank }: { journey: Journey; rank?: number }) {
  const reduceMotion = useReducedMotion();
  const firstLeg = journey.legs[0];
  const lastLeg = journey.legs[journey.legs.length - 1];
  const stopover = journey.stopovers[0];

  const featuredCity: FeaturedCity = stopover
    ? { iata: stopover.airport.iata, cityName: stopover.cityName, countryCode: stopover.countryCode }
    : { iata: lastLeg.to.iata, cityName: lastLeg.to.cityName, countryCode: lastLeg.to.countryCode };

  const weather = getCityWeather(featuredCity.iata, monthFromISODate(journey.criteria.departureDate));

  const highlights = stopover?.highlights.slice(0, 3) ?? [];

  // A single, concise accessible name for the whole card link — otherwise a
  // screen reader concatenates every labelled child (map, weather, ring, all
  // the text) into one unwieldy link name.
  const linkLabel = `${featuredCity.cityName}, ${countryName(featuredCity.countryCode)} — journey score ${journey.score.total}, ${formatMoney(journey.cost.total)}`;

  const handleSelect = () => {
    track({
      name: 'journey_selected',
      journeyId: journey.id,
      rank: rank ?? -1,
      kind: journey.kind,
      score: journey.score.total,
      badges: journey.badges,
    });
  };

  return (
    <motion.div
      variants={cardVariants}
      layout
      whileHover={reduceMotion ? undefined : { y: -3, scale: 1.01 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <Link
        to={criteriaToJourneyPath(journey.id, journey.criteria)}
        onClick={handleSelect}
        aria-label={linkLabel}
        className="group block rounded-xl focus-visible:outline-none"
      >
        <Card className="overflow-hidden p-0 transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2">
          <div className="relative">
            <RouteMap journey={journey} />

            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/20"
              aria-hidden="true"
            />

            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
              <div className="flex flex-wrap gap-1.5">
                {journey.badges.map((b) => (
                  <BadgeChip key={b} badge={b} onImage />
                ))}
              </div>
              {weather && <WeatherBadge weather={weather} />}
            </div>

            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
              <h3 className="text-lg font-bold leading-tight text-white drop-shadow-sm sm:text-xl">
                {featuredCity.cityName}
              </h3>
              <p className="text-xs font-medium text-white/85 drop-shadow-sm sm:text-sm">
                {countryName(featuredCity.countryCode)}
              </p>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Journey score
                </p>
                <p className="text-sm font-medium text-foreground/80">{scoreBand(journey.score.total)}</p>
              </div>
              <ExperienceRing score={journey.score.total} size={56} strokeWidth={5} className="shrink-0" />
            </div>

            <div className="flex flex-wrap gap-2">
              <SavingsPill headroom={journey.cost.headroom} />
              <CabinPill cabin={firstLeg.cabin} />
              <DurationPill minutes={journey.totalTravelTimeMinutes} />
            </div>

            {stopover ? (
              <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <BedDouble className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{stopover.hotel.name}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-current text-amber-500" aria-hidden="true" />
                      {stopover.hotel.starRating}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatMoney(stopover.hotel.pricePerNight)}/night</span>
                    <span aria-hidden="true">·</span>
                    <span>{HOTEL_TIER_LABEL[stopover.hotel.tier]}</span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-2.5 text-sm text-muted-foreground">
                <MoonStar className="h-4 w-4 shrink-0" aria-hidden="true" />
                Direct — no overnight stay
              </p>
            )}

            <JourneyMiniTimeline journey={journey} />

            {stopover ? (
              highlights.length > 0 && (
                <ul className="space-y-1 text-sm text-foreground/80">
                  {highlights.map((highlight, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-foreground/80">
                <Zap className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                Straight there — no stops, no waiting.
              </p>
            )}

            <div className="flex items-end justify-between gap-4 border-t pt-4">
              <div>
                <div className="text-xl font-bold sm:text-2xl">{formatMoney(journey.cost.total)}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Wallet className="h-3 w-3" aria-hidden="true" />
                  Total trip cost
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                View journey
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
