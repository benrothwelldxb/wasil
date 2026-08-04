import { Armchair, Clock, PiggyBank } from 'lucide-react';
import type { CabinClass, Money } from '@/domain/types';
import { formatDuration, formatMoney } from '@/domain/format';
import { cn } from '@/lib/utils';

const CABIN_LABEL: Record<CabinClass, string> = {
  economy: 'Economy',
  premium_economy: 'Premium economy',
  business: 'Business',
};

function Pill({
  icon: Icon,
  children,
  className,
}: {
  icon: typeof PiggyBank;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground',
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      {children}
    </span>
  );
}

/** "You save {money}" — or a neutral "under budget" note when headroom is nil. */
export function SavingsPill({ headroom, className }: { headroom: Money; className?: string }) {
  const hasSavings = headroom.amount > 0;
  return (
    <Pill icon={PiggyBank} className={className}>
      {hasSavings ? `You save ${formatMoney(headroom)}` : 'Under budget'}
    </Pill>
  );
}

/** Title-cased cabin class, e.g. "Premium economy". */
export function CabinPill({ cabin, className }: { cabin: CabinClass; className?: string }) {
  return (
    <Pill icon={Armchair} className={className}>
      {CABIN_LABEL[cabin]}
    </Pill>
  );
}

/** Total flying time, e.g. "10h 15m flying". */
export function DurationPill({ minutes, className }: { minutes: number; className?: string }) {
  return (
    <Pill icon={Clock} className={className}>
      {formatDuration(minutes)} flying
    </Pill>
  );
}
