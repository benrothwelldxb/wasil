import { Bed, Car, Plane, Wallet } from 'lucide-react';
import type { CostBreakdown } from '@/domain/types';
import { formatMoney, formatPercent } from '@/domain/format';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const ROWS = [
  { key: 'flights', label: 'Flights', icon: Plane },
  { key: 'hotels', label: 'Hotels', icon: Bed },
  { key: 'transfers', label: 'Transfers', icon: Car },
] as const;

export function CostBreakdownPanel({ cost }: { cost: CostBreakdown }) {
  const usedPct = Math.min(100, Math.round((cost.total.amount / cost.budget.amount) * 100));

  return (
    <Card className="p-5">
      <h3 className="mb-4 inline-flex items-center gap-2 font-semibold">
        <Wallet className="h-4 w-4" />
        Cost breakdown
      </h3>

      <dl className="space-y-2.5">
        {ROWS.map((row) => {
          const Icon = row.icon;
          const value = cost[row.key];
          if (value.amount === 0 && row.key !== 'flights') return null;
          return (
            <div key={row.key} className="flex items-center justify-between text-sm">
              <dt className="inline-flex items-center gap-2 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {row.label}
              </dt>
              <dd className="font-medium tabular-nums">{formatMoney(value)}</dd>
            </div>
          );
        })}
        <div className="flex items-center justify-between border-t pt-2.5 text-base">
          <dt className="font-semibold">Total</dt>
          <dd className="font-bold tabular-nums">{formatMoney(cost.total)}</dd>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <dt>Per person</dt>
          <dd className="tabular-nums">{formatMoney(cost.perPerson)}</dd>
        </div>
      </dl>

      <div className="mt-4 space-y-2">
        <Progress value={usedPct} aria-label={`Budget used: ${usedPct}%`} />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {usedPct}% of {formatMoney(cost.budget)} budget
          </span>
          <span className="font-medium text-primary">
            {formatMoney(cost.headroom)} left ({formatPercent(cost.headroomPct)})
          </span>
        </div>
      </div>
    </Card>
  );
}
