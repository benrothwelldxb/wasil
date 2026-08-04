import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plane, Search } from 'lucide-react';
import { CITIES } from '@/data/datasets/cities';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface AirportComboboxProps {
  label: string;
  value: string;
  onChange: (iata: string) => void;
  excludeIata?: string;
  placeholder?: string;
}

export function AirportCombobox({
  label,
  value,
  onChange,
  excludeIata,
  placeholder = 'Select a city',
}: AirportComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => CITIES.find((c) => c.iata === value), [value]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CITIES.filter((c) => {
      if (c.iata === excludeIata) return false;
      if (!q) return true;
      return (
        c.cityName.toLowerCase().includes(q) ||
        c.iata.toLowerCase().includes(q) ||
        c.countryCode.toLowerCase().includes(q)
      );
    }).slice(0, 40);
  }, [query, excludeIata]);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="inline-flex items-center gap-2 truncate">
              <Plane className="h-4 w-4 shrink-0 text-muted-foreground" />
              {selected ? (
                <span className="truncate">
                  {selected.cityName}{' '}
                  <span className="text-muted-foreground">({selected.iata})</span>
                </span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city or airport code"
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {results.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No cities found
              </li>
            )}
            {results.map((c) => (
              <li key={c.iata}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.iata);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>
                    {c.cityName}{' '}
                    <span className="text-muted-foreground">
                      {c.iata} · {c.countryCode}
                    </span>
                  </span>
                  {value === c.iata && <Check className="h-4 w-4 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
