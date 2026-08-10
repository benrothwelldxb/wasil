import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import type { Severity, Symptom } from '@/domain/models';
import { SEVERITY_SCALE, severityLabel, severityOrdinal } from '@/domain/constants';
import { cn } from '@/lib/utils';

/**
 * A single symptom row: icon + label, with either a display-only current-state
 * indicator (Today) or an interactive control passed as children (Check-in).
 */
export function SymptomRow({
  symptom,
  indicator,
  children,
  className,
}: {
  symptom: Symptom;
  indicator?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('py-3', className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name={symptom.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{symptom.label}</p>
          {symptom.description ? (
            <p className="truncate text-xs text-muted-foreground">{symptom.description}</p>
          ) : null}
        </div>
        {indicator ? <div className="shrink-0">{indicator}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/**
 * Display-only severity indicator: a short scale of dots plus a text label.
 * Never relies on colour alone — the text label is always present.
 */
export function SeverityIndicator({ severity }: { severity: Severity }) {
  const ordinal = severityOrdinal(severity);
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {SEVERITY_SCALE.slice(1).map((step) => (
          <span
            key={step.value}
            className={cn(
              'size-1.5 rounded-full',
              step.ordinal <= ordinal ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
      </span>
      <span className="w-16 text-right text-xs font-medium text-muted-foreground">
        {severityLabel(severity)}
      </span>
    </div>
  );
}
