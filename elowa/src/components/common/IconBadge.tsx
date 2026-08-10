import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

type BadgeSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type BadgeTone = 'brand' | 'muted' | 'accent' | 'attention';

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-10',
  xl: 'size-11',
  '2xl': 'size-12',
};

const TONE_CLASS: Record<BadgeTone, string> = {
  brand: 'bg-primary-soft text-primary',
  muted: 'bg-muted text-foreground',
  accent: 'bg-accent text-accent-foreground',
  attention: 'bg-attention/15 text-attention',
};

const ICON_SIZE: Record<BadgeSize, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-5',
  xl: 'size-5',
  '2xl': 'size-6',
};

/**
 * The recurring "line icon inside a soft rounded surface" atom. Standardises
 * size, rounding and tone so the motif stays consistent across cards and rows.
 */
export function IconBadge({
  icon,
  size = 'md',
  tone = 'brand',
  shape = 'circle',
  className,
}: {
  icon: string;
  size?: BadgeSize;
  tone?: BadgeTone;
  shape?: 'circle' | 'squircle';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        shape === 'circle' ? 'rounded-full' : 'rounded-2xl',
        className,
      )}
    >
      <Icon name={icon} className={ICON_SIZE[size]} />
    </span>
  );
}
