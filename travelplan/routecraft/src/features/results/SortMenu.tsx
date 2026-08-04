import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUiStore, type SortMode } from '@/stores/ui-store';

const OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'experience', label: 'Experience' },
  { value: 'price', label: 'Price (low to high)' },
  { value: 'duration', label: 'Duration' },
  { value: 'value', label: 'Score per dollar' },
];

export function SortMenu() {
  const sort = useUiStore((s) => s.sort);
  const setSort = useUiStore((s) => s.setSort);
  const active = OPTIONS.find((o) => o.value === sort);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ArrowUpDown className="h-4 w-4" />
          Sort: {active?.label ?? 'Experience'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Sort journeys by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          {OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
