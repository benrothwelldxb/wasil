import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Search } from 'lucide-react';
import { searchCriteriaSchema } from '@/domain/schemas';
import { criteriaToResultsPath } from '@/domain/url';
import { draftToCriteria, useSearchStore } from '@/stores/search-store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AirportCombobox } from './AirportCombobox';
import { BudgetSlider } from './BudgetSlider';
import { CabinSelect } from './CabinSelect';
import { PaxPicker } from './PaxPicker';
import { PreferencePicker } from './PreferencePicker';

const today = () => new Date().toISOString().slice(0, 10);

export function SearchForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const draft = useSearchStore((s) => s.draft);
  const setDraft = useSearchStore((s) => s.setDraft);
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const swap = () => setDraft({ origin: draft.destination, destination: draft.origin });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const criteria = draftToCriteria(draft);
    const result = searchCriteriaSchema.safeParse(criteria);
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      if (!draft.origin) next.origin = 'Choose a departure city';
      if (!draft.destination) next.destination = 'Choose a destination';
      if (!draft.departureDate) next.departureDate = 'Pick a departure date';
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmitted?.();
    navigate(criteriaToResultsPath(result.data));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div>
          <AirportCombobox
            label="From"
            value={draft.origin}
            excludeIata={draft.destination}
            onChange={(iata) => setDraft({ origin: iata })}
          />
          {errors.origin && <p className="mt-1 text-xs text-destructive">{errors.origin}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={swap}
          aria-label="Swap origin and destination"
          className="mb-1 hidden sm:inline-flex"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <div>
          <AirportCombobox
            label="To"
            value={draft.destination}
            excludeIata={draft.origin}
            onChange={(iata) => setDraft({ destination: iata })}
          />
          {errors.destination && (
            <p className="mt-1 text-xs text-destructive">{errors.destination}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="departureDate">Departure</Label>
          <Input
            id="departureDate"
            type="date"
            min={today()}
            value={draft.departureDate}
            onChange={(e) => setDraft({ departureDate: e.target.value })}
          />
          {errors.departureDate && (
            <p className="text-xs text-destructive">{errors.departureDate}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="returnDate">Return (optional)</Label>
          <Input
            id="returnDate"
            type="date"
            min={draft.departureDate || today()}
            value={draft.returnDate ?? ''}
            onChange={(e) => setDraft({ returnDate: e.target.value || undefined })}
          />
          {errors.returnDate && <p className="text-xs text-destructive">{errors.returnDate}</p>}
        </div>
        <PaxPicker
          adults={draft.adults}
          children={draft.children}
          onChange={(patch) => setDraft(patch)}
        />
        <CabinSelect value={draft.cabin} onChange={(cabin) => setDraft({ cabin })} />
      </div>

      <BudgetSlider value={draft.budget} onCommit={(budget) => setDraft({ budget })} />
      {errors.budget && <p className="text-xs text-destructive">{errors.budget}</p>}

      <div className="space-y-2">
        <Label>What makes a great trip for you?</Label>
        <PreferencePicker
          value={draft.preferences}
          onChange={(preferences) => setDraft({ preferences })}
        />
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Maximum stopovers</Label>
          <ToggleGroup
            type="single"
            value={String(draft.maxStopovers)}
            onValueChange={(v) => v && setDraft({ maxStopovers: Number(v) as 0 | 1 | 2 })}
            className="justify-start"
          >
            <ToggleGroupItem value="0">Direct only</ToggleGroupItem>
            <ToggleGroupItem value="1">Up to 1</ToggleGroupItem>
            <ToggleGroupItem value="2">Up to 2</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-2">
          <Label>Max nights per stopover</Label>
          <ToggleGroup
            type="single"
            value={String(draft.maxStopoverNights)}
            onValueChange={(v) => v && setDraft({ maxStopoverNights: Number(v) as 1 | 2 | 3 })}
            className="justify-start"
          >
            <ToggleGroupItem value="1">1</ToggleGroupItem>
            <ToggleGroupItem value="2">2</ToggleGroupItem>
            <ToggleGroupItem value="3">3</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full gap-2 text-base">
        <Search className="h-5 w-5" />
        Craft my journeys
      </Button>
    </form>
  );
}
