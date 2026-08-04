/**
 * Hotel option construction and tier selection. Every stopover gets one option
 * per tier; the selected tier depends on how much budget survives the flights
 * (post-flight headroom), and the two unchosen tiers become alternatives.
 */
import type { HotelOption, HotelTier } from '@/domain/types';
import type { City } from '@/data/datasets/cities';
import {
  HOTEL_AMENITIES,
  HOTEL_BRANDS,
  NEIGHBORHOODS,
  TIER_GUEST_RATING,
  TIER_STARS,
} from '@/data/datasets/hotel-brands';
import { priceHotelNight } from './pricing';
import { toBase36Id, type Rng } from './rng';

const TIER_ORDER: HotelTier[] = ['budget', 'midscale', 'upscale'];

function buildHotelOption(
  city: City,
  tier: HotelTier,
  nights: number,
  rooms: number,
  idSeed: string,
  rng: Rng,
): HotelOption {
  const pricePerNight = priceHotelNight(city.hotelBaseRates[tier], rng);
  const totalPrice = pricePerNight * rooms * nights;
  const brand = rng.pick(HOTEL_BRANDS[tier]);
  const neighborhood = rng.pick(NEIGHBORHOODS);
  const [ratingMin, ratingMax] = TIER_GUEST_RATING[tier];
  const guestRating = Math.round(rng.jitter((ratingMin + ratingMax) / 2, 0.05) * 10) / 10;

  return {
    id: toBase36Id(`${idSeed}|htl|${tier}`),
    name: `${brand} ${neighborhood}`,
    tier,
    starRating: TIER_STARS[tier],
    guestRating: Math.min(9.8, Math.max(6.0, guestRating)),
    neighborhood,
    pricePerNight: { amount: pricePerNight, currency: 'USD' },
    totalPrice: { amount: totalPrice, currency: 'USD' },
    amenities: [...HOTEL_AMENITIES[tier]],
  };
}

export interface HotelSelection {
  hotel: HotelOption;
  alternativeHotels: HotelOption[];
}

/**
 * Build all three tier options and pick one:
 *   - upscale when post-flight headroom > 40%
 *   - budget when post-flight headroom < 12%
 *   - midscale otherwise
 */
export function buildHotels(
  city: City,
  nights: number,
  rooms: number,
  postFlightHeadroomPct: number,
  idSeed: string,
  rng: Rng,
): HotelSelection {
  const options: Record<HotelTier, HotelOption> = {
    budget: buildHotelOption(city, 'budget', nights, rooms, idSeed, rng),
    midscale: buildHotelOption(city, 'midscale', nights, rooms, idSeed, rng),
    upscale: buildHotelOption(city, 'upscale', nights, rooms, idSeed, rng),
  };

  let selectedTier: HotelTier = 'midscale';
  if (postFlightHeadroomPct > 0.4) selectedTier = 'upscale';
  else if (postFlightHeadroomPct < 0.12) selectedTier = 'budget';

  return {
    hotel: options[selectedTier],
    alternativeHotels: TIER_ORDER.filter((t) => t !== selectedTier).map((t) => options[t]),
  };
}
