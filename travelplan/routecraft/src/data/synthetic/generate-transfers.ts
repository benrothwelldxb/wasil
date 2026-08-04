/**
 * Ground-transfer construction for a stopover (an arrival leg from the airport
 * and a departure leg back to it). Two modes are drawn from the city's own
 * `transferModes` so the pairing stays plausible for the place.
 */
import type { Transfer, TransferMode } from '@/domain/types';
import type { City } from '@/data/datasets/cities';
import { quoteTransfer } from './pricing';
import { toBase36Id, type Rng } from './rng';

export interface StopoverTransfers {
  arrival: Transfer;
  departure: Transfer;
}

function buildTransfer(
  mode: TransferMode,
  direction: 'arrival' | 'departure',
  city: City,
  heads: number,
  idSeed: string,
  rng: Rng,
): Transfer {
  const quote = quoteTransfer(mode, heads, rng);
  const airport = `${city.iata} Airport`;
  const cityCenter = `${city.cityName} city centre`;
  return {
    id: toBase36Id(`${idSeed}|xfer|${direction}|${mode}`),
    mode,
    from: direction === 'arrival' ? airport : cityCenter,
    to: direction === 'arrival' ? cityCenter : airport,
    durationMinutes: quote.durationMinutes,
    price: { amount: quote.price, currency: 'USD' },
    comfortRating: quote.comfortRating,
  };
}

/** Choose two (ideally distinct) transfer modes and build both legs. */
export function buildTransfers(
  city: City,
  heads: number,
  idSeed: string,
  rng: Rng,
): StopoverTransfers {
  const modes = city.transferModes;
  const first = rng.pick(modes);
  const remaining = modes.filter((m) => m !== first);
  const second = remaining.length > 0 ? rng.pick(remaining) : first;

  return {
    arrival: buildTransfer(first, 'arrival', city, heads, idSeed, rng),
    departure: buildTransfer(second, 'departure', city, heads, idSeed, rng),
  };
}
