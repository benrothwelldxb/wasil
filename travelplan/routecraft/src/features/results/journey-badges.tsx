import { Award, Gem, PiggyBank, Zap } from 'lucide-react';
import type { JourneyBadge } from '@/domain/types';
import { cn } from '@/lib/utils';

export const BADGE_META: Record<
  JourneyBadge,
  { label: string; icon: typeof Award; className: string }
> = {
  'best-experience': {
    label: 'Best experience',
    icon: Award,
    className: 'bg-primary/15 text-primary border-primary/30',
  },
  fastest: {
    label: 'Fastest',
    icon: Zap,
    className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  },
  'best-value': {
    label: 'Best value',
    icon: PiggyBank,
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  },
  'hidden-gem': {
    label: 'Hidden gem',
    icon: Gem,
    className: 'bg-accent/15 text-accent border-accent/30',
  },
};

/**
 * A journey badge. `onImage` swaps the translucent tint fill for a frosted
 * glass background (matching `WeatherBadge`) so the label stays legible when
 * the chip sits over the route-map hero — the tinted text/border are kept.
 */
export function BadgeChip({ badge, onImage }: { badge: JourneyBadge; onImage?: boolean }) {
  const meta = BADGE_META[badge];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        meta.className,
        onImage &&
          'border-white/20 bg-background/70 shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-background/55',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
