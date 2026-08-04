import { useId } from 'react';
import type { CabinClass } from '@/domain/types';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CABIN_LABELS: Record<CabinClass, string> = {
  economy: 'Economy',
  premium_economy: 'Premium economy',
  business: 'Business',
};

export function CabinSelect({
  value,
  onChange,
}: {
  value: CabinClass;
  onChange: (value: CabinClass) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Cabin</Label>
      <Select value={value} onValueChange={(v) => onChange(v as CabinClass)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(CABIN_LABELS) as CabinClass[]).map((cabin) => (
            <SelectItem key={cabin} value={cabin}>
              {CABIN_LABELS[cabin]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
