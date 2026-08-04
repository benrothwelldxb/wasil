import { describe, expect, it } from 'vitest';
import type {
  AirportRef,
  HotelOption,
  Journey,
  Leg,
  SearchCriteria,
  StopoverCity,
  Transfer,
} from '../types';
import { BASE_WEIGHTS, effectiveWeights } from './weights';
import { computeCostBreakdown, money } from './cost';
import { applyBudgetConstraint, isFeasible } from './constraints';
import { applyHotelChoice, rankJourneys } from './score';

// ——— tiny fixture builders (scoring is tested in isolation from the generator) ———

const AIRPORTS: Record<string, AirportRef> = {
  DXB: { iata: 'DXB', cityName: 'Dubai', countryCode: 'AE' },
  MAN: { iata: 'MAN', cityName: 'Manchester', countryCode: 'GB' },
  IST: { iata: 'IST', cityName: 'Istanbul', countryCode: 'TR' },
};

const baseCriteria: SearchCriteria = {
  origin: 'DXB',
  destination: 'MAN',
  departureDate: '2026-09-15',
  pax: { adults: 1, children: 0 },
  budget: { amount: 1500, currency: 'USD' },
  cabin: 'economy',
  preferences: [],
  maxStopovers: 2,
  minStopoverNights: 1,
  maxStopoverNights: 2,
};

let legCounter = 0;
function makeLeg(
  from: AirportRef,
  to: AirportRef,
  opts: {
    depart: string;
    arrive: string;
    price: number;
    comfort?: number;
    redEye?: boolean;
  },
): Leg {
  legCounter += 1;
  const durationMinutes =
    (new Date(opts.arrive).getTime() - new Date(opts.depart).getTime()) / 60000;
  return {
    id: `leg-${legCounter}`,
    from,
    to,
    departure: opts.depart,
    arrival: opts.arrive,
    durationMinutes,
    airline: { code: 'MR', name: 'Meridian Air', comfortRating: opts.comfort ?? 3 },
    flightNumber: 'MR100',
    cabin: 'economy',
    aircraft: 'A350',
    isRedEye: opts.redEye ?? false,
    pricePerPax: money(opts.price),
  };
}

function makeHotel(id: string, tier: HotelOption['tier'], pricePerNight: number, nights: number): HotelOption {
  const star = tier === 'upscale' ? 5 : tier === 'midscale' ? 4 : 3;
  return {
    id,
    name: `${tier} stay`,
    tier,
    starRating: star,
    guestRating: tier === 'upscale' ? 9.2 : tier === 'midscale' ? 8.4 : 7.5,
    neighborhood: 'Old Town',
    pricePerNight: money(pricePerNight),
    totalPrice: money(pricePerNight * nights),
    amenities: ['wifi'],
  };
}

function makeTransfer(id: string, duration: number, price: number): Transfer {
  return {
    id,
    mode: 'train',
    from: 'Airport',
    to: 'City',
    durationMinutes: duration,
    price: money(price),
    comfortRating: 4,
  };
}

function makeStopover(city: AirportRef, nights: number, appeal: number): StopoverCity {
  return {
    airport: city,
    cityName: city.cityName,
    countryCode: city.countryCode,
    nights,
    appealScore: appeal,
    tags: ['culture', 'food'],
    headline: `${city.cityName} stopover`,
    highlights: ['a', 'b', 'c'],
    hotel: makeHotel('h-mid', 'midscale', 120, nights),
    alternativeHotels: [makeHotel('h-bud', 'budget', 70, nights), makeHotel('h-up', 'upscale', 240, nights)],
    transfers: { arrival: makeTransfer('t-in', 40, 25), departure: makeTransfer('t-out', 40, 25) },
  };
}

function assemble(
  id: string,
  legs: Leg[],
  stopovers: StopoverCity[],
  criteria: SearchCriteria = baseCriteria,
): Journey {
  const cost = computeCostBreakdown({ legs, stopovers, pax: criteria.pax, budget: criteria.budget });
  const totalTravelTimeMinutes = legs.reduce((s, l) => s + l.durationMinutes, 0);
  const doorToDoor =
    (new Date(legs[legs.length - 1].arrival).getTime() - new Date(legs[0].departure).getTime()) /
    60000;
  return {
    id,
    kind: stopovers.length > 0 ? 'stopover' : 'direct',
    criteria,
    legs,
    stopovers,
    totalTravelTimeMinutes,
    doorToDoorMinutes: doorToDoor,
    cost,
    score: {
      total: 0,
      factors: {
        stopoverAppeal: 0,
        comfort: 0,
        travelTimeEfficiency: 0,
        layoverQuality: 0,
        valueForMoney: 0,
        scheduleConvenience: 0,
      },
      weights: BASE_WEIGHTS,
      narrative: '',
    },
    badges: [],
  };
}

const directJourney = (criteria = baseCriteria) =>
  assemble(
    'direct-1',
    [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T02:00:00Z',
        arrive: '2026-09-15T09:30:00Z',
        price: 620,
        comfort: 3,
        redEye: true,
      }),
    ],
    [],
    criteria,
  );

const istanbulStopover = (criteria = baseCriteria) =>
  assemble(
    'stop-ist',
    [
      makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
        depart: '2026-09-15T09:00:00Z',
        arrive: '2026-09-15T13:00:00Z',
        price: 300,
        comfort: 4,
      }),
      makeLeg(AIRPORTS.IST, AIRPORTS.MAN, {
        depart: '2026-09-16T10:00:00Z',
        arrive: '2026-09-16T14:00:00Z',
        price: 260,
        comfort: 4,
      }),
    ],
    [makeStopover(AIRPORTS.IST, 1, 92)],
    criteria,
  );

describe('weights', () => {
  it('base weights sum to 1', () => {
    const sum = Object.values(BASE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('effective weights always re-normalise to 1', () => {
    for (const prefs of [[], ['speed'], ['culture', 'comfort'], ['food', 'nightlife', 'relaxation']] as const) {
      const w = effectiveWeights([...prefs]);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('a preference raises its target factor weight relative to base', () => {
    const speedy = effectiveWeights(['speed']);
    expect(speedy.travelTimeEfficiency).toBeGreaterThan(BASE_WEIGHTS.travelTimeEfficiency);
  });
});

describe('cost', () => {
  it('applies child fare discount and never reports negative headroom', () => {
    const familyCriteria: SearchCriteria = {
      ...baseCriteria,
      pax: { adults: 2, children: 2 },
      budget: { amount: 6000, currency: 'USD' },
    };
    const j = istanbulStopover(familyCriteria);
    // flights = (300+260) * (2 + 2*0.75) = 560 * 3.5 = 1960
    expect(j.cost.flights.amount).toBeCloseTo(1960, 2);
    expect(j.cost.headroom.amount).toBeGreaterThanOrEqual(0);
    expect(j.cost.total.amount).toBe(
      Math.round((j.cost.flights.amount + j.cost.hotels.amount + j.cost.transfers.amount) * 100) / 100,
    );
  });
});

describe('constraints', () => {
  it('keeps at-budget journeys and filters over-budget ones', () => {
    const cheap = directJourney();
    const pricey = assemble(
      'pricey',
      [
        makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
          depart: '2026-09-15T02:00:00Z',
          arrive: '2026-09-15T09:30:00Z',
          price: 5000,
        }),
      ],
      [],
    );
    const res = applyBudgetConstraint([cheap, pricey], baseCriteria);
    expect(res.kept).toHaveLength(1);
    expect(res.kept[0].id).toBe('direct-1');
    expect(res.overBudgetFiltered).toBe(1);
    expect(res.cheapestOverBudget?.amount).toBe(5000);
  });

  it('exactly-at-budget passes the hard constraint', () => {
    const j = directJourney();
    const criteria: SearchCriteria = {
      ...baseCriteria,
      budget: { amount: j.cost.total.amount, currency: 'USD' },
    };
    const res = applyBudgetConstraint([j], criteria);
    expect(res.kept).toHaveLength(1);
  });

  it('rejects infeasible tight connections', () => {
    const tight = assemble(
      'tight',
      [
        makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
          depart: '2026-09-15T09:00:00Z',
          arrive: '2026-09-15T13:00:00Z',
          price: 300,
        }),
        makeLeg(AIRPORTS.IST, AIRPORTS.MAN, {
          depart: '2026-09-15T13:30:00Z', // 30 min connection
          arrive: '2026-09-15T17:30:00Z',
          price: 260,
        }),
      ],
      [],
    );
    expect(isFeasible(tight)).toBe(false);
    expect(isFeasible(directJourney())).toBe(true);
  });
});

describe('rankJourneys', () => {
  it('is deterministic — same input yields identical scores', () => {
    const a = rankJourneys([directJourney(), istanbulStopover()], baseCriteria);
    const b = rankJourneys([directJourney(), istanbulStopover()], baseCriteria);
    expect(a.map((j) => j.score.total)).toEqual(b.map((j) => j.score.total));
  });

  it('a red-eye never scores higher comfort than the same journey without it', () => {
    const withRedEye = directJourney();
    const withoutRedEye = assemble(
      'direct-day',
      [
        makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
          depart: '2026-09-15T10:00:00Z',
          arrive: '2026-09-15T17:30:00Z',
          price: 620,
          comfort: 3,
          redEye: false,
        }),
      ],
      [],
    );
    const [rRed] = rankJourneys([withRedEye], baseCriteria);
    const [rDay] = rankJourneys([withoutRedEye], baseCriteria);
    expect(rRed.score.factors.comfort).toBeLessThan(rDay.score.factors.comfort);
  });

  it('assigns best-experience to rank 1 and fastest to the quickest', () => {
    const ranked = rankJourneys([directJourney(), istanbulStopover()], baseCriteria);
    expect(ranked[0].badges).toContain('best-experience');
    const fastest = ranked.find((j) => j.badges.includes('fastest'));
    expect(fastest?.id).toBe('direct-1'); // single 7.5h leg beats 8h flying time
  });

  it('Dubai→Manchester with a culture preference ranks the Istanbul stopover above the direct red-eye', () => {
    const criteria: SearchCriteria = { ...baseCriteria, preferences: ['culture'] };
    const ranked = rankJourneys([directJourney(criteria), istanbulStopover(criteria)], criteria);
    const istRank = ranked.findIndex((j) => j.id === 'stop-ist');
    const directRank = ranked.findIndex((j) => j.id === 'direct-1');
    expect(istRank).toBeLessThan(directRank);
    expect(ranked[0].id).toBe('stop-ist');
  });
});

describe('applyHotelChoice', () => {
  it('swaps the hotel, recomputes cost, and adjusts value-for-money', () => {
    const [ranked] = rankJourneys([istanbulStopover()], baseCriteria);
    const upscaleId = ranked.stopovers[0].alternativeHotels.find((h) => h.tier === 'upscale')!.id;
    const swapped = applyHotelChoice(ranked, upscaleId);

    expect(swapped.stopovers[0].hotel.id).toBe(upscaleId);
    expect(swapped.cost.total.amount).toBeGreaterThan(ranked.cost.total.amount);
    // more expensive hotel → less headroom → lower value-for-money
    expect(swapped.score.factors.valueForMoney).toBeLessThan(ranked.score.factors.valueForMoney);
    // previously selected hotel is retained as an alternative
    expect(swapped.stopovers[0].alternativeHotels.some((h) => h.id === 'h-mid')).toBe(true);
  });

  it('is a no-op for an unknown hotel id', () => {
    const [ranked] = rankJourneys([istanbulStopover()], baseCriteria);
    expect(applyHotelChoice(ranked, 'does-not-exist')).toBe(ranked);
  });
});
