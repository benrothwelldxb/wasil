/**
 * Fictional hotel-name building blocks. Names are composed as
 * `${brand} ${neighborhood}` per tier, so the same city can surface plausibly
 * different-sounding properties across budget, midscale, and upscale.
 */
import type { HotelTier } from '@/domain/types';

export const HOTEL_BRANDS: Record<HotelTier, string[]> = {
  budget: [
    'CityLodge',
    'UrbanNest',
    'Metro Inn',
    'TravelCourt',
    'Comfort Stay',
    'Nomad Rooms',
    'EasyStay',
  ],
  midscale: [
    'Meridian Suites',
    'Grand Central Hotel',
    'The Continental',
    'Parkview Hotel',
    'Boulevard Hotel',
    'Harbour Court',
    'The Wayfarer',
  ],
  upscale: [
    'The Regent',
    'Palazzo Grand',
    'Aurora Collection',
    'The Ambassador',
    'Celestine Hotel',
    'Royal Meridian',
    'The Beaumont',
  ],
};

export const NEIGHBORHOODS: string[] = [
  'Old Town',
  'Downtown',
  'Riverside',
  'Marina District',
  'Central Quarter',
  'Historic Center',
  'Waterfront',
  'Cathedral Quarter',
  'Garden District',
  'Grand Boulevard',
];

export const HOTEL_AMENITIES: Record<HotelTier, string[]> = {
  budget: ['Free Wi-Fi', '24-hour reception', 'Air conditioning', 'Self check-in'],
  midscale: [
    'Free Wi-Fi',
    'Breakfast included',
    'Fitness center',
    'Airport shuttle',
    'On-site restaurant',
  ],
  upscale: [
    'Free Wi-Fi',
    'Spa & wellness',
    'Rooftop pool',
    '24-hour concierge',
    'Fine dining',
    'Airport limousine',
  ],
};

export const TIER_STARS: Record<HotelTier, 3 | 4 | 5> = {
  budget: 3,
  midscale: 4,
  upscale: 5,
};

/** Guest-rating band per tier: [min, max], within 6.0–9.8. */
export const TIER_GUEST_RATING: Record<HotelTier, [number, number]> = {
  budget: [6.8, 7.8],
  midscale: [7.6, 8.6],
  upscale: [8.6, 9.6],
};
