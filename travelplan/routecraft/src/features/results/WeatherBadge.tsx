import { Cloud, CloudRain, CloudSun, Snowflake, Sun } from 'lucide-react';
import type { WeatherSummary } from '@/domain/hotels/types';
import { cn } from '@/lib/utils';

const CONDITION_META: Record<
  WeatherSummary['condition'],
  { icon: typeof Sun; label: string }
> = {
  sunny: { icon: Sun, label: 'Sunny' },
  partly_cloudy: { icon: CloudSun, label: 'Partly cloudy' },
  cloudy: { icon: Cloud, label: 'Cloudy' },
  rainy: { icon: CloudRain, label: 'Rainy' },
  snowy: { icon: Snowflake, label: 'Snowy' },
};

/** Compact glass chip: condition icon + average temperature + short label. */
export function WeatherBadge({
  weather,
  className,
}: {
  weather: WeatherSummary;
  className?: string;
}) {
  const meta = CONDITION_META[weather.condition];
  const Icon = meta.icon;
  const avgTemp = Math.round((weather.averageHighC + weather.averageLowC) / 2);

  return (
    <span
      role="img"
      aria-label={`Weather: ${meta.label.toLowerCase()}, ${avgTemp}°`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-black/10 bg-background/70 px-2 py-0.5 dark:border-white/15',
        'text-xs font-medium text-foreground shadow-sm backdrop-blur-sm',
        'supports-[backdrop-filter]:bg-background/50',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{avgTemp}°</span>
      <span className="text-muted-foreground">{meta.label}</span>
    </span>
  );
}
