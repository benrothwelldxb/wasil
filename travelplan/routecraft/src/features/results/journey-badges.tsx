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

export function BadgeChip({ badge }: { badge: JourneyBadge }) {
  const meta = BADGE_META[badge];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        meta.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
