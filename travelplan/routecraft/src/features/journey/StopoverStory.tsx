import { Check, MapPin, Sparkles, Star } from 'lucide-react';
import type { HotelOption, StopoverCity } from '@/domain/types';
import { formatMoney } from '@/domain/format';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

function HotelChoice({ hotel, selected }: { hotel: HotelOption; selected: boolean }) {
  return (
    <Label
      htmlFor={hotel.id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'hover:border-foreground/30',
      )}
    >
      <RadioGroupItem value={hotel.id} id={hotel.id} className="mt-1" />
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{hotel.name}</span>
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney(hotel.totalPrice)}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            {Array.from({ length: hotel.starRating }).map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-current" />
            ))}
          </span>
          <span className="capitalize">{hotel.tier}</span>
          <span>· {hotel.guestRating.toFixed(1)}/10 guest score</span>
          <span>· {hotel.neighborhood}</span>
          <span>· {formatMoney(hotel.pricePerNight)}/night</span>
        </div>
      </div>
    </Label>
  );
}

export function StopoverStory({
  stopover,
  onHotelChange,
}: {
  stopover: StopoverCity;
  onHotelChange: (hotelId: string) => void;
}) {
  const allHotels = [stopover.hotel, ...stopover.alternativeHotels];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-accent">
        <Sparkles className="h-4 w-4" />
        {stopover.nights}-night stopover
      </div>
      <h3 className="mt-1 text-xl font-bold">{stopover.cityName}</h3>
      <p className="mt-1 text-muted-foreground">{stopover.headline}</p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {stopover.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      {stopover.visaNote ? (
        <p className="mt-3 inline-flex items-start gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {stopover.visaNote}
        </p>
      ) : null}

      <div className="mt-5">
        <div className="mb-2 text-sm font-semibold">Where you&apos;ll stay</div>
        <RadioGroup
          value={stopover.hotel.id}
          onValueChange={onHotelChange}
          className="space-y-2"
        >
          {allHotels.map((hotel) => (
            <HotelChoice key={hotel.id} hotel={hotel} selected={hotel.id === stopover.hotel.id} />
          ))}
        </RadioGroup>
      </div>
    </Card>
  );
}
