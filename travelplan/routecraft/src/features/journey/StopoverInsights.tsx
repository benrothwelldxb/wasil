import type { ComponentType } from 'react';
import {
  Bus,
  CarTaxiFront,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  Footprints,
  MapPinned,
  ShieldCheck,
  Sun,
  TrainFront,
  Wallet,
} from 'lucide-react';
import type { HotelSearchRequest, StopoverAccommodation, WeatherCondition } from '@/domain/hotels';
import type { Pax, TransferMode } from '@/domain/types';
import { formatMoney } from '@/domain/format';
import { useStopoverAccommodation } from '@/hooks/use-stopover-accommodation';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const WEATHER_ICON: Record<WeatherCondition, ComponentType<{ className?: string }>> = {
  sunny: Sun,
  partly_cloudy: CloudSun,
  cloudy: Cloud,
  rainy: CloudRain,
  snowy: CloudSnow,
};

const WEATHER_LABEL: Record<WeatherCondition, string> = {
  sunny: 'Sunny',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  rainy: 'Rainy',
  snowy: 'Snowy',
};

const TRANSFER_ICON: Record<TransferMode, ComponentType<{ className?: string }>> = {
  metro: TrainFront,
  train: TrainFront,
  taxi: CarTaxiFront,
  shuttle: Bus,
};

const TRANSFER_LABEL: Record<TransferMode, string> = {
  metro: 'Metro',
  train: 'Train',
  taxi: 'Taxi',
  shuttle: 'Shuttle',
};

function formatDurationShort(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface MetricProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}

function Metric({ icon: Icon, label, value, sub }: MetricProps) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </div>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="insights-skeleton">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

function InsightsGrid({ accommodation }: { accommodation: StopoverAccommodation }) {
  const WeatherIcon = WEATHER_ICON[accommodation.weather.condition];
  const TransferIcon = TRANSFER_ICON[accommodation.airportTransfer.mode];

  return (
    <div
      role="group"
      aria-label={`Stopover insights for ${accommodation.cityName}`}
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
    >
      <Metric
        icon={Wallet}
        label="Avg. hotel price"
        value={formatMoney(accommodation.averageNightlyPrice)}
        sub="per night"
      />
      <Metric
        icon={Footprints}
        label="Walking score"
        value={`${Math.round(accommodation.walkingScore)}/100`}
      />
      <Metric
        icon={TransferIcon}
        label="Airport transfer"
        value={TRANSFER_LABEL[accommodation.airportTransfer.mode]}
        sub={formatDurationShort(accommodation.airportTransfer.durationMinutes)}
      />
      <Metric
        icon={MapPinned}
        label="Neighbourhood"
        value={`${accommodation.neighbourhoodRating.toFixed(1)}/5`}
      />
      <Metric
        icon={ShieldCheck}
        label="Safety"
        value={`${Math.round(accommodation.safetyScore)}/100`}
      />
      <Metric
        icon={WeatherIcon}
        label="Weather"
        value={WEATHER_LABEL[accommodation.weather.condition]}
        sub={`${Math.round(accommodation.weather.averageHighC)}° / ${Math.round(accommodation.weather.averageLowC)}°C`}
      />
      <Metric
        icon={Wallet}
        label="Total accommodation"
        value={formatMoney(accommodation.totalAccommodationCost)}
      />
    </div>
  );
}

export function StopoverInsights({
  cityIata,
  cityName,
  nights,
  pax,
  date,
}: {
  cityIata: string;
  cityName: string;
  nights: number;
  pax: Pax;
  date: string;
}) {
  const req: HotelSearchRequest = { cityIata, nights, pax, date };
  const query = useStopoverAccommodation(req);

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
        Stopover insights &middot; {cityName}
      </h3>

      {query.isLoading ? <InsightsSkeleton /> : null}

      {query.isError || (query.isSuccess && !query.data) ? (
        <p className="text-sm text-muted-foreground">Insights unavailable.</p>
      ) : null}

      {query.isSuccess && query.data ? <InsightsGrid accommodation={query.data} /> : null}
    </Card>
  );
}
