import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { formatMoney } from '@/domain/format';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

interface BudgetSliderProps {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/** Live value tracks during drag; the committed value only updates on release. */
export function BudgetSlider({
  value,
  onCommit,
  min = 200,
  max = 20000,
  step = 100,
}: BudgetSliderProps) {
  const [live, setLive] = useState(value);

  useEffect(() => {
    setLive(value);
  }, [value]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="inline-flex items-center gap-1.5">
          <Wallet className="h-4 w-4" />
          Total budget
        </Label>
        <span className="text-lg font-semibold tabular-nums text-primary">
          {formatMoney({ amount: live, currency: 'USD' })}
        </span>
      </div>
      <Slider
        value={[live]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => setLive(v)}
        onValueCommit={([v]) => onCommit(v)}
        thumbLabel="Total trip budget"
      />
      <p className="text-xs text-muted-foreground">
        A hard cap for the whole trip — flights, hotels and transfers combined.
      </p>
    </div>
  );
}
