import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

const DEFAULT_NOTICE =
  'This app helps you record and understand patterns in your wellbeing. It does not diagnose medical conditions or replace advice from a healthcare professional.';

/**
 * Reusable health-information notice. Calm, non-alarming framing used to remind
 * users of the product's boundaries.
 */
export function HealthNotice({
  children = DEFAULT_NOTICE,
  className,
  compact = false,
}: {
  children?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-3 rounded-2xl bg-muted/60 text-muted-foreground',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <Icon name="Info" className="mt-0.5 size-5 shrink-0 text-primary" />
      <p className={cn('leading-relaxed', compact ? 'text-xs' : 'text-sm')}>{children}</p>
    </div>
  );
}

/**
 * A distinct, higher-contrast "seek medical advice" callout STYLE, provided for
 * future use. Phase 0 does NOT encode any medical red-flag logic — this is only
 * the reusable presentation.
 */
export function SeekAdviceCallout({
  title = 'When to seek medical advice',
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-attention/30 bg-attention/10 p-4 text-foreground',
        className,
      )}
    >
      <Icon name="TriangleAlert" className="mt-0.5 size-5 shrink-0 text-attention" />
      <div>
        <p className="text-sm font-semibold text-attention">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-foreground/80">{children}</p>
      </div>
    </div>
  );
}
