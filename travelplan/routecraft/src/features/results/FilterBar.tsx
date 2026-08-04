import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { Money } from '@/domain/types';
import { formatMoney } from '@/domain/format';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useUiStore } from '@/stores/ui-store';

/** Client-side view controls. Never triggers a refetch — only reshapes cache. */
export function FilterBar({ budget }: { budget: Money }) {
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);
  const resetFilters = useUiStore((s) => s.resetFilters);

  const ceiling = filters.priceCeiling ?? budget.amount;

  // `onValueChange` fires on every pointer-move during a drag; committing it
  // straight to the store re-renders `ResultsPage`'s `aria-live="polite"`
  // result count on every one of those, which is dozens of announcements per
  // drag. Mirror `BudgetSlider`: track the live value locally for the
  // visible label, and only push to the store (and so to the live region)
  // on release.
  const [liveMinScore, setLiveMinScore] = useState(filters.minScore);
  const [liveCeiling, setLiveCeiling] = useState(ceiling);

  useEffect(() => {
    setLiveMinScore(filters.minScore);
  }, [filters.minScore]);

  useEffect(() => {
    setLiveCeiling(ceiling);
  }, [ceiling]);

  return (
    <div className="space-y-6 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 font-semibold">
          <SlidersHorizontal className="h-4 w-4" />
          Refine
        </h2>
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Reset
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Maximum stopovers</Label>
        <ToggleGroup
          type="single"
          value={String(filters.maxStops)}
          onValueChange={(v) => v && setFilters({ maxStops: Number(v) as 0 | 1 | 2 })}
          className="justify-start"
        >
          <ToggleGroupItem value="0">Direct</ToggleGroupItem>
          <ToggleGroupItem value="1">1 stop</ToggleGroupItem>
          <ToggleGroupItem value="2">2 stops</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Minimum experience score</Label>
          <span className="text-sm font-medium tabular-nums">{liveMinScore}</span>
        </div>
        <Slider
          value={[liveMinScore]}
          min={0}
          max={100}
          step={5}
          onValueChange={([v]) => setLiveMinScore(v)}
          onValueCommit={([v]) => setFilters({ minScore: v })}
          thumbLabel="Minimum journey score"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Price ceiling</Label>
          <span className="text-sm font-medium tabular-nums">
            {formatMoney({ amount: liveCeiling, currency: budget.currency })}
          </span>
        </div>
        <Slider
          value={[liveCeiling]}
          min={Math.max(100, Math.round(budget.amount * 0.2))}
          max={budget.amount}
          step={50}
          onValueChange={([v]) => setLiveCeiling(v)}
          onValueCommit={([v]) => setFilters({ priceCeiling: v >= budget.amount ? null : v })}
          thumbLabel="Maximum price"
        />
      </div>

      <Separator />

      <label className="flex cursor-pointer items-center justify-between">
        <span className="text-sm">Exclude red-eye flights</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[hsl(var(--primary))]"
          checked={filters.excludeRedEye}
          onChange={(e) => setFilters({ excludeRedEye: e.target.checked })}
        />
      </label>
    </div>
  );
}
