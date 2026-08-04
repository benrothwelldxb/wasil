import { useEffect, useId, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plane, Search } from 'lucide-react';
import { CITIES, type City } from '@/data/datasets/cities';
import { cn } from '@/lib/utils';
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
  // Which result the keyboard cursor is on — drives both the visual
  // highlight and `aria-activedescendant` on the input.
  const [activeIndex, setActiveIndex] = useState(0);

  const listboxId = useId();

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

  // The filtered set changes shape on every keystroke — keep the keyboard
  // cursor pinned to the top of the (new) list rather than an index that no
  // longer points at the same city.
  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const activeOptionId =
    activeIndex >= 0 && activeIndex < results.length
      ? `${listboxId}-option-${results[activeIndex].iata}`
      : undefined;

  function selectCity(city: City) {
    onChange(city.iata);
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        e.preventDefault();
        const city = results[activeIndex];
        if (city) selectCity(city);
        break;
      }
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
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
              onKeyDown={handleKeyDown}
              placeholder="Search city or airport code"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No cities found</p>
          ) : (
            <ul
              id={listboxId}
              role="listbox"
              aria-label={`${label} results`}
              className="max-h-64 overflow-y-auto p-1"
            >
              {results.map((c, i) => {
                const isSelected = value === c.iata;
                const isActive = i === activeIndex;
                return (
                  <li
                    key={c.iata}
                    id={`${listboxId}-option-${c.iata}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => selectCity(c)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm',
                      isActive ? 'bg-muted' : 'hover:bg-muted',
                    )}
                  >
                    <span>
                      {c.cityName}{' '}
                      <span className="text-muted-foreground">
                        {c.iata} · {c.countryCode}
                      </span>
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
