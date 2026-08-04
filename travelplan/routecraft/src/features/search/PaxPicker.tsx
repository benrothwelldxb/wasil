import { Minus, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface PaxPickerProps {
  adults: number;
  children: number;
  onChange: (patch: { adults?: number; children?: number }) => void;
}

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-6 text-center tabular-nums">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function PaxPicker({ adults, children, onChange }: PaxPickerProps) {
  const total = adults + children;
  return (
    <div className="space-y-2">
      <Label>Travellers</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start gap-2 font-normal">
            <Users className="h-4 w-4" />
            {total} traveller{total > 1 ? 's' : ''}
            <span className="text-muted-foreground">
              ({adults} adult{adults > 1 ? 's' : ''}
              {children > 0 ? `, ${children} child${children > 1 ? 'ren' : ''}` : ''})
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-4">
          <Stepper
            label="Adults"
            hint="Age 12+"
            value={adults}
            min={1}
            max={9}
            onChange={(v) => onChange({ adults: v })}
          />
          <Stepper
            label="Children"
            hint="Age 2–11"
            value={children}
            min={0}
            max={6}
            onChange={(v) => onChange({ children: v })}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
