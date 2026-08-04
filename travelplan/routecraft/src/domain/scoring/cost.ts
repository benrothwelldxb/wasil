/**
 * Cost aggregation — shared by the journey generator and by `applyHotelChoice`
 * so cost math lives in exactly one place.
 */
import type {
  CostBreakdown,
  Leg,
  Money,
  Pax,
  StopoverCity,
} from '../types';

/** Children fly at 75% of the adult fare. */
const CHILD_FARE_FACTOR = 0.75;

export const money = (amount: number): Money => ({
  amount: Math.round(amount * 100) / 100,
  currency: 'USD',
});

export const totalHeads = (pax: Pax): number => pax.adults + pax.children;

/** Fare-weighted passenger count used to price flights. */
export const farePax = (pax: Pax): number =>
  pax.adults + pax.children * CHILD_FARE_FACTOR;

export interface CostInput {
  legs: Leg[];
  stopovers: StopoverCity[];
  pax: Pax;
  budget: Money;
}

export function computeCostBreakdown({
  legs,
  stopovers,
  pax,
  budget,
}: CostInput): CostBreakdown {
  const fpax = farePax(pax);
  const heads = totalHeads(pax);

  const flights = legs.reduce((sum, leg) => sum + leg.pricePerPax.amount * fpax, 0);
  const hotels = stopovers.reduce((sum, s) => sum + s.hotel.totalPrice.amount, 0);
  const transfers = stopovers.reduce(
    (sum, s) => sum + s.transfers.arrival.price.amount + s.transfers.departure.price.amount,
    0,
  );

  const total = flights + hotels + transfers;
  const headroom = Math.max(0, budget.amount - total);
  const headroomPct = budget.amount > 0 ? Math.min(1, headroom / budget.amount) : 0;

  return {
    flights: money(flights),
    hotels: money(hotels),
    transfers: money(transfers),
    total: money(total),
    perPerson: money(heads > 0 ? total / heads : total),
    budget: { ...budget },
    headroom: money(headroom),
    headroomPct,
  };
}
