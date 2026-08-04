import { Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  /** RouteGlyph's size — journey detail hero, slightly larger touch target. */
  sm: { wrap: 'gap-0.5 rounded px-1 text-xs', icon: 'h-3 w-3' },
  /** JourneyMiniTimeline's size — compact card route strip. */
  xs: { wrap: 'gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium', icon: 'h-2.5 w-2.5' },
} as const;

/**
 * Small "N nights" chip used wherever a route walk renders a stopover node —
 * previously copy-pasted (Moon icon + tinted background + accent text) in
 * both `RouteGlyph` and `JourneyMiniTimeline`. `text-accent-strong` (not the
 * plain `text-accent` fill token) keeps the label AA-readable.
 */
export function NightsChip({ nights, size }: { nights: number; size: 'sm' | 'xs' }) {
  const classes = SIZE_CLASSES[size];
  return (
    <span
      className={cn(
        'inline-flex items-center bg-accent/15 text-accent-strong',
        classes.wrap,
      )}
    >
      <Moon className={classes.icon} aria-hidden="true" />
      {nights}
    </span>
  );
}
