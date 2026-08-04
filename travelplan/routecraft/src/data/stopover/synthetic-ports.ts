/**
 * Real (synthetic-backed) implementations of the discovery engine's
 * `FlightSearchPort` and `HotelEstimatorPort` — the seams `discover.ts`
 * depends on. Both are deterministic: every random draw comes from a
 * `createRng` seed derived from the request, never `Math.random`/`Date.now`,
 * so identical requests yield byte-identical legs/hotels/transfers.
 */
import type { Leg } from '@/domain/types';
import type {
  FlightSearchPort,
  FlightSearchRequest,
  HotelEstimateRequest,
  HotelEstimateResult,
  HotelEstimatorPort,
} from '@/domain/stopover';
import { getCity } from '@/data/datasets/cities';
import { isoAt, makeLeg } from '@/data/synthetic/generate-legs';
import { buildHotels } from '@/data/synthetic/generate-hotels';
import { buildTransfers } from '@/data/synthetic/generate-transfers';
import { createRng } from '@/data/synthetic/rng';
import { ProviderError } from '@/data/provider/errors';

interface TimeBand {
  key: string;
  hours: readonly number[];
}

/** Morning / afternoon / red-eye departure windows, UTC hours. */
const TIME_BANDS: readonly TimeBand[] = [
  { key: 'morning', hours: [7, 8, 9, 10] },
  { key: 'afternoon', hours: [13, 14, 15, 16] },
  { key: 'redeye', hours: [22, 23, 0, 1] },
];

function flightSeed(req: FlightSearchRequest): string {
  return `flight|${req.from}|${req.to}|${req.date}|${req.cabin}`;
}

/**
 * Real (synthetic) flight search: for a known `from`/`to` pair, returns one
 * candidate `Leg` per time band (morning/afternoon/red-eye) so the engine has
 * a choice of departures to pick the cheapest from. Unknown airports throw
 * `ProviderError('UNKNOWN_AIRPORT', ...)`.
 */
export function createSyntheticFlightSearch(): FlightSearchPort {
  return {
    async search(req: FlightSearchRequest): Promise<Leg[]> {
      const from = getCity(req.from);
      if (!from) throw new ProviderError('UNKNOWN_AIRPORT', `Unknown airport: ${req.from}`);
      const to = getCity(req.to);
      if (!to) throw new ProviderError('UNKNOWN_AIRPORT', `Unknown airport: ${req.to}`);

      const seed = flightSeed(req);
      const legs: Leg[] = [];
      for (const band of TIME_BANDS) {
        const idSeed = `${seed}|${band.key}`;
        const rng = createRng(idSeed);
        const departISO = isoAt(req.date, rng.pick(band.hours), rng.randInt(0, 55));
        const { leg } = makeLeg({
          from,
          to,
          departISO,
          cabin: req.cabin,
          throughFare: false,
          idSeed,
          rng,
        });
        legs.push(leg);
      }
      return legs;
    },
  };
}

function hotelSeed(req: HotelEstimateRequest): string {
  return `hotel|${req.city.iata}|${req.nights}|${req.date}`;
}

/**
 * Fixed post-flight budget headroom fed to `buildHotels`'s tier-selection
 * heuristic. The port has no visibility into the actual flight spend for
 * this candidate (that is only known once the engine has picked legs), so a
 * flat, reasonable mid-range value is used rather than a wire-through of
 * partial state; `buildHotels` treats > 0.4 as upscale-worthy, < 0.12 as
 * budget-only, so 0.3 lands squarely in the midscale default.
 */
const POST_FLIGHT_HEADROOM_PCT = 0.3;

/**
 * Real (synthetic) hotel estimator: resolves the city from the dataset and
 * builds a hotel + alternatives + ground transfers via the same generators
 * the direct/synthetic provider uses. `HotelEstimateRequest` carries `rooms`
 * but not the traveller headcount directly; `heads` (used only for the
 * per-head component of transfer pricing) is approximated as `rooms * 2`,
 * matching the `rooms = ceil(heads / 2)` convention used to compute `rooms`
 * upstream.
 */
export function createSyntheticHotelEstimator(): HotelEstimatorPort {
  return {
    async estimate(req: HotelEstimateRequest): Promise<HotelEstimateResult> {
      const city = getCity(req.city.iata);
      if (!city) {
        throw new ProviderError('UNKNOWN_AIRPORT', `Unknown airport: ${req.city.iata}`);
      }

      const idSeed = hotelSeed(req);
      const rng = createRng(idSeed);
      const heads = req.rooms * 2;

      const { hotel, alternativeHotels } = buildHotels(
        city,
        req.nights,
        req.rooms,
        POST_FLIGHT_HEADROOM_PCT,
        idSeed,
        rng,
      );
      const transfers = buildTransfers(city, heads, idSeed, rng);

      return { hotel, alternativeHotels, transfers };
    },
  };
}
