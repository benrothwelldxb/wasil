import { describe, it, expect } from 'vitest';
import { deriveJourneyScoreFactors } from './index';
import type { Journey, Leg, StopoverCity, AirportRef, CostBreakdown, ExperienceScore } from '@/domain/types';
import type { JourneyScoreSignals } from './types';

describe('deriveJourneyScoreFactors', () => {
  // ———— Fixture builders ————
  const AIRPORTS: Record<string, AirportRef> = {
    DXB: { iata: 'DXB', cityName: 'Dubai', countryCode: 'AE' },
    MAN: { iata: 'MAN', cityName: 'Manchester', countryCode: 'GB' },
    IST: { iata: 'IST', cityName: 'Istanbul', countryCode: 'TR' },
    CDG: { iata: 'CDG', cityName: 'Paris', countryCode: 'FR' },
  };

  function makeLeg(
    from: AirportRef,
    to: AirportRef,
    opts: {
      depart: string;
      arrive: string;
      price: number;
      cabin?: 'economy' | 'premium_economy' | 'business';
      comfort?: number;
    }
  ): Leg {
    const cabin = opts.cabin ?? 'economy';
    const comfort = opts.comfort ?? 3;
    const durationMinutes =
      (new Date(opts.arrive).getTime() - new Date(opts.depart).getTime()) / 60000;
    return {
      id: `leg-${Math.random()}`,
      from,
      to,
      departure: opts.depart,
      arrival: opts.arrive,
      durationMinutes,
      airline: { code: 'MR', name: 'Meridian Air', comfortRating: comfort },
      flightNumber: 'MR100',
      cabin,
      aircraft: 'A350',
      isRedEye: false,
      pricePerPax: { amount: opts.price, currency: 'USD' },
    };
  }

  function makeHotel(id: string, starRating: 3 | 4 | 5, guestRating: number, nights: number) {
    return {
      id,
      name: 'Test Hotel',
      tier: starRating === 5 ? ('upscale' as const) : starRating === 4 ? ('midscale' as const) : ('budget' as const),
      starRating,
      guestRating,
      neighborhood: 'Test Neighborhood',
      pricePerNight: { amount: 100, currency: 'USD' as const },
      totalPrice: { amount: 100 * nights, currency: 'USD' as const },
      amenities: [],
    };
  }

  function makeTransfer(id: string, durationMinutes: number, comfortRating: number) {
    return {
      id,
      mode: 'metro' as const,
      from: 'Airport',
      to: 'City',
      durationMinutes,
      price: { amount: 25, currency: 'USD' as const },
      comfortRating,
    };
  }

  function makeStopover(airport: AirportRef, nights: number): StopoverCity {
    return {
      airport,
      cityName: airport.cityName,
      countryCode: airport.countryCode,
      nights,
      appealScore: 75,
      tags: [],
      headline: `${airport.cityName} stopover`,
      highlights: [],
      hotel: makeHotel('h1', 4, 8.5, nights),
      alternativeHotels: [],
      transfers: {
        arrival: makeTransfer('t-in', 40, 3),
        departure: makeTransfer('t-out', 40, 3),
      },
    };
  }

  function makeJourney(id: string, legs: Leg[], stopovers: StopoverCity[]): Journey {
    const totalTravelTimeMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
    const doorToDoorMinutes =
      stopovers.length === 0
        ? totalTravelTimeMinutes
        : (new Date(legs[legs.length - 1].arrival).getTime() -
            new Date(legs[0].departure).getTime()) /
          60000;

    const costBreakdown: CostBreakdown = {
      flights: { amount: 500, currency: 'USD' },
      hotels: { amount: stopovers.reduce((sum, s) => sum + s.hotel.totalPrice.amount, 0), currency: 'USD' },
      transfers: { amount: stopovers.length * 50, currency: 'USD' },
      total: { amount: 600, currency: 'USD' },
      perPerson: { amount: 600, currency: 'USD' },
      budget: { amount: 1500, currency: 'USD' },
      headroom: { amount: 900, currency: 'USD' },
      headroomPct: 0.6,
    };

    const score: ExperienceScore = {
      total: 0,
      factors: {
        stopoverAppeal: 0,
        comfort: 0,
        travelTimeEfficiency: 0,
        layoverQuality: 0,
        valueForMoney: 0,
        scheduleConvenience: 0,
      },
      weights: {
        stopoverAppeal: 0.2,
        comfort: 0.2,
        travelTimeEfficiency: 0.2,
        layoverQuality: 0.2,
        valueForMoney: 0.1,
        scheduleConvenience: 0.1,
      },
      narrative: '',
    };

    return {
      id,
      kind: stopovers.length > 0 ? 'stopover' : 'direct',
      criteria: {
        origin: legs[0].from.iata,
        destination: legs[legs.length - 1].to.iata,
        departureDate: '2026-09-15',
        pax: { adults: 1, children: 0 },
        budget: costBreakdown.budget,
        cabin: 'economy',
        preferences: [],
        maxStopovers: 2,
        minStopoverNights: 1,
        maxStopoverNights: 2,
      },
      legs,
      stopovers,
      totalTravelTimeMinutes,
      doorToDoorMinutes,
      cost: costBreakdown,
      score,
      badges: [],
    };
  }

  // ———— Direct journey (no stopovers) ————
  it('direct journey: hotelQuality and transfers are null', () => {
    const journey = makeJourney('direct-1', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 80,
        foodRating: 75,
        safety: 85,
        neighbourhoodQuality: 80,
        airportQuality: 75,
        weather: 70,
        tzOffsetHours: 0,
      },
      stopovers: [],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    expect(factors.hotelQuality).toBeNull();
    expect(factors.transfers).toBeNull();
  });

  it('direct journey: cost, cabinQuality are numbers in [0,100]', () => {
    const journey = makeJourney('direct-2', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
        comfort: 4,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 80,
        foodRating: 75,
        safety: 85,
        neighbourhoodQuality: 80,
        airportQuality: 75,
        weather: 70,
        tzOffsetHours: 0,
      },
      stopovers: [],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    expect(typeof factors.cost).toBe('number');
    expect(factors.cost).toBeGreaterThanOrEqual(0);
    expect(factors.cost).toBeLessThanOrEqual(100);
    expect(typeof factors.cabinQuality).toBe('number');
    expect(factors.cabinQuality).toBeGreaterThanOrEqual(0);
    expect(factors.cabinQuality).toBeLessThanOrEqual(100);
  });

  it('direct journey with full signals: cost, cabinQuality, weather, duration, jetLag, etc. are present', () => {
    const journey = makeJourney('direct-3', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 80,
        foodRating: 75,
        safety: 85,
        neighbourhoodQuality: 80,
        airportQuality: 75,
        weather: 70,
        tzOffsetHours: 0,
      },
      stopovers: [],
      referenceDurationMinutes: 360,
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    expect(factors.cost).not.toBeNull();
    expect(factors.cabinQuality).not.toBeNull();
    expect(factors.weather).not.toBeNull();
    expect(factors.duration).not.toBeNull();
    expect(factors.jetLag).not.toBeNull();
    expect(factors.airportQuality).not.toBeNull();
    expect(factors.touristAppeal).not.toBeNull();
    expect(factors.neighbourhoodQuality).not.toBeNull();
    expect(factors.foodRating).not.toBeNull();
    expect(factors.safety).not.toBeNull();
  });

  // ———— Stopover journey (1+ stopovers) ————
  it('1-stopover journey: hotelQuality and transfers are non-null numbers in [0,100]', () => {
    const journey = makeJourney('stop-1', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
        depart: '2026-09-15T09:00:00Z',
        arrive: '2026-09-15T13:00:00Z',
        price: 300,
      }),
      makeLeg(AIRPORTS.IST, AIRPORTS.MAN, {
        depart: '2026-09-16T10:00:00Z',
        arrive: '2026-09-16T14:00:00Z',
        price: 260,
      }),
    ], [
      makeStopover(AIRPORTS.IST, 1),
    ]);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 80,
        foodRating: 75,
        safety: 85,
        neighbourhoodQuality: 80,
        airportQuality: 75,
        weather: 70,
        tzOffsetHours: 0,
      },
      stopovers: [
        {
          touristAppeal: 85,
          foodRating: 80,
          safety: 82,
          neighbourhoodQuality: 85,
          airportQuality: 80,
          weather: 72,
        },
      ],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    expect(typeof factors.hotelQuality).toBe('number');
    expect(factors.hotelQuality).toBeGreaterThanOrEqual(0);
    expect(factors.hotelQuality).toBeLessThanOrEqual(100);
    expect(typeof factors.transfers).toBe('number');
    expect(factors.transfers).toBeGreaterThanOrEqual(0);
    expect(factors.transfers).toBeLessThanOrEqual(100);
  });

  it('jet lag wraps across the date line to the shorter direction (SYD/JFK ~9h, not 15h)', () => {
    const journey = makeJourney(
      'tz-wrap',
      [
        makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
          depart: '2026-09-15T09:00:00Z',
          arrive: '2026-09-15T15:00:00Z',
          price: 500,
        }),
      ],
      [],
    );
    const eastbound: JourneyScoreSignals = {
      origin: { tzOffsetHours: 10 }, // SYD
      destination: { tzOffsetHours: -5 }, // JFK
      stopovers: [],
    };
    const westbound: JourneyScoreSignals = {
      origin: { tzOffsetHours: -5 }, // JFK
      destination: { tzOffsetHours: 10 }, // SYD
      stopovers: [],
    };

    const east = deriveJourneyScoreFactors(journey, eastbound).jetLag;
    const west = deriveJourneyScoreFactors(journey, westbound).jetLag;

    expect(east).not.toBeNull();
    expect(west).not.toBeNull();
    // Wrapped to a 9h shift: westbound (gentler) beats eastbound, and it is
    // non-zero — the un-wrapped Δ=15 would have zeroed both, erasing asymmetry.
    expect(west as number).toBeGreaterThan(east as number);
    expect(west as number).toBeGreaterThan(0);
  });

  it('stopover journey: touristAppeal reflects stopover signals when present', () => {
    const journey = makeJourney('stop-appeal', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
        depart: '2026-09-15T09:00:00Z',
        arrive: '2026-09-15T13:00:00Z',
        price: 300,
      }),
      makeLeg(AIRPORTS.IST, AIRPORTS.MAN, {
        depart: '2026-09-16T10:00:00Z',
        arrive: '2026-09-16T14:00:00Z',
        price: 260,
      }),
    ], [
      makeStopover(AIRPORTS.IST, 1),
    ]);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 50, // destination appeal is lower
        foodRating: 50,
        safety: 50,
        neighbourhoodQuality: 50,
        airportQuality: 50,
        weather: 50,
        tzOffsetHours: 0,
      },
      stopovers: [
        {
          touristAppeal: 95, // stopover has high appeal
          foodRating: 90,
          safety: 92,
          neighbourhoodQuality: 93,
          airportQuality: 91,
          weather: 75,
        },
      ],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    // With stopover, should use stopover appeal (95), not destination (50)
    expect(factors.touristAppeal).toBeCloseTo(95, 0);
  });

  // ———— Jet lag ————
  it('jetLag: missing tz info → null', () => {
    const journey = makeJourney('no-tz', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85 }, // missing tzOffsetHours
      destination: { airportQuality: 75 }, // missing tzOffsetHours
      stopovers: [],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    expect(factors.jetLag).toBeNull();
  });

  it('jetLag: eastbound (dest tz > origin tz) scores lower than same-magnitude westbound', () => {
    // Eastbound: DXB (UTC+4) → Manchester (UTC+0) — actually westbound
    // Let's use a true eastbound: Manchester (UTC+0) → Bangkok (UTC+7)
    const journey = makeJourney('eastbound', [
      makeLeg(AIRPORTS.MAN, AIRPORTS.IST, { // Manchester to Istanbul (eastbound)
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T15:00:00Z',
        price: 400,
      }),
    ], []);

    const eastboundSignals: JourneyScoreSignals = {
      origin: { tzOffsetHours: 0 }, // UTC
      destination: { tzOffsetHours: 3 }, // 3 hours east
      stopovers: [],
    };

    const westboundSignals: JourneyScoreSignals = {
      origin: { tzOffsetHours: 3 }, // starting 3 hours east
      destination: { tzOffsetHours: 0 }, // going to UTC
      stopovers: [],
    };

    const eastScore = deriveJourneyScoreFactors(journey, eastboundSignals);
    const westScore = deriveJourneyScoreFactors(journey, westboundSignals);

    // Eastbound should score lower (higher penalty factor 1.3)
    expect(eastScore.jetLag).toBeLessThan(westScore.jetLag!);
  });

  it('jetLag: bigger tz gap scores lower', () => {
    const journey = makeJourney('tz-gap', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
      }),
    ], []);

    const smallGap: JourneyScoreSignals = {
      origin: { tzOffsetHours: 0 },
      destination: { tzOffsetHours: 1 },
      stopovers: [],
    };

    const largeGap: JourneyScoreSignals = {
      origin: { tzOffsetHours: 0 },
      destination: { tzOffsetHours: 8 },
      stopovers: [],
    };

    const smallScore = deriveJourneyScoreFactors(journey, smallGap);
    const largeScore = deriveJourneyScoreFactors(journey, largeGap);

    expect(smallScore.jetLag).toBeGreaterThan(largeScore.jetLag!);
  });

  // ———— Stopover-or-dest pattern ————
  it('direct journey: falls back to destination signals for weather/appeal/etc', () => {
    const journey = makeJourney('direct-fallback', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 88,
        foodRating: 82,
        safety: 90,
        neighbourhoodQuality: 85,
        airportQuality: 75,
        weather: 75,
        tzOffsetHours: 0,
      },
      stopovers: [],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    // With no stopover, should use destination signals
    expect(factors.touristAppeal).toBe(88);
    expect(factors.foodRating).toBe(82);
    expect(factors.safety).toBe(90);
    expect(factors.neighbourhoodQuality).toBe(85);
  });

  it('stopover journey: uses stopover signals, not destination, for weather/appeal/etc', () => {
    const journey = makeJourney('stop-override', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
        depart: '2026-09-15T09:00:00Z',
        arrive: '2026-09-15T13:00:00Z',
        price: 300,
      }),
      makeLeg(AIRPORTS.IST, AIRPORTS.MAN, {
        depart: '2026-09-16T10:00:00Z',
        arrive: '2026-09-16T14:00:00Z',
        price: 260,
      }),
    ], [
      makeStopover(AIRPORTS.IST, 1),
    ]);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 50,
        foodRating: 50,
        safety: 50,
        neighbourhoodQuality: 50,
        airportQuality: 50,
        weather: 50,
        tzOffsetHours: 0,
      },
      stopovers: [
        {
          touristAppeal: 90,
          foodRating: 85,
          safety: 88,
          neighbourhoodQuality: 87,
          airportQuality: 80,
          weather: 80,
        },
      ],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    // With stopover, should use stopover values, not destination
    expect(factors.touristAppeal).toBe(90);
    expect(factors.foodRating).toBe(85);
    expect(factors.safety).toBe(88);
    expect(factors.neighbourhoodQuality).toBe(87);
  });

  it('missing stopover signal with empty stopover values → null (does not fall back to destination)', () => {
    const journey = makeJourney('stop-missing', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
        depart: '2026-09-15T09:00:00Z',
        arrive: '2026-09-15T13:00:00Z',
        price: 300,
      }),
      makeLeg(AIRPORTS.IST, AIRPORTS.MAN, {
        depart: '2026-09-16T10:00:00Z',
        arrive: '2026-09-16T14:00:00Z',
        price: 260,
      }),
    ], [
      makeStopover(AIRPORTS.IST, 1),
    ]);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 60, // destination has value
        foodRating: 70,
        safety: 75,
        neighbourhoodQuality: 65,
        airportQuality: 75,
        weather: 70,
        tzOffsetHours: 0,
      },
      stopovers: [
        {
          // stopover is missing touristAppeal
          foodRating: 85,
          safety: 88,
          neighbourhoodQuality: 87,
          airportQuality: 80,
          weather: 80,
        },
      ],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    // When stopovers are present, stopover-or-dest uses only stopover values.
    // If stopover is missing the field, the values array is empty, so mean([]) = null.
    // It does NOT fall back to destination in this case.
    expect(factors.touristAppeal).toBeNull();
  });

  // ———— All factors in [0, 100] ————
  it('every emitted non-null value is within [0, 100]', () => {
    const journey = makeJourney('bounded', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
        depart: '2026-09-15T09:00:00Z',
        arrive: '2026-09-15T13:00:00Z',
        price: 300,
      }),
      makeLeg(AIRPORTS.IST, AIRPORTS.MAN, {
        depart: '2026-09-16T10:00:00Z',
        arrive: '2026-09-16T14:00:00Z',
        price: 260,
      }),
    ], [
      makeStopover(AIRPORTS.IST, 2),
    ]);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 90, tzOffsetHours: 0 },
      destination: {
        touristAppeal: 95,
        foodRating: 90,
        safety: 92,
        neighbourhoodQuality: 88,
        airportQuality: 85,
        weather: 88,
        tzOffsetHours: 3,
      },
      stopovers: [
        {
          touristAppeal: 92,
          foodRating: 89,
          safety: 91,
          neighbourhoodQuality: 90,
          airportQuality: 87,
          weather: 85,
        },
      ],
      referenceDurationMinutes: 500,
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    for (const value of Object.values(factors)) {
      if (value !== null) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  // ———— Missing reference duration ————
  it('duration is null when referenceDurationMinutes is missing', () => {
    const journey = makeJourney('no-ref', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 80,
        foodRating: 75,
        safety: 85,
        neighbourhoodQuality: 80,
        airportQuality: 75,
        weather: 70,
        tzOffsetHours: 0,
      },
      stopovers: [],
      // referenceDurationMinutes is omitted
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    expect(factors.duration).toBeNull();
  });

  it('duration is present when referenceDurationMinutes is provided', () => {
    const journey = makeJourney('with-ref', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 80,
        foodRating: 75,
        safety: 85,
        neighbourhoodQuality: 80,
        airportQuality: 75,
        weather: 70,
        tzOffsetHours: 0,
      },
      stopovers: [],
      referenceDurationMinutes: 300,
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    expect(typeof factors.duration).toBe('number');
    expect(factors.duration).toBeGreaterThanOrEqual(0);
    expect(factors.duration).toBeLessThanOrEqual(100);
  });

  // ———— Missing optional signals ————
  it('factors are null when signals are absent and fallback does not apply', () => {
    const journey = makeJourney('sparse', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: {}, // no airport quality
      destination: {}, // no city signals
      stopovers: [],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    expect(factors.weather).toBeNull();
    expect(factors.touristAppeal).toBeNull();
    expect(factors.foodRating).toBeNull();
    expect(factors.safety).toBeNull();
    expect(factors.neighbourhoodQuality).toBeNull();
    expect(factors.airportQuality).toBeNull();
  });

  // ———— Determinism ————
  it('determinism: same journey + signals → identical factors', () => {
    const journey = makeJourney('det', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: {
        touristAppeal: 80,
        foodRating: 75,
        safety: 85,
        neighbourhoodQuality: 80,
        airportQuality: 75,
        weather: 70,
        tzOffsetHours: 0,
      },
      stopovers: [],
      referenceDurationMinutes: 350,
    };

    const factors1 = deriveJourneyScoreFactors(journey, signals);
    const factors2 = deriveJourneyScoreFactors(journey, signals);
    expect(factors1).toEqual(factors2);
  });

  // ———— Cabin quality calculation ————
  it('cabinQuality factors economy vs premium_economy vs business', () => {
    const economyJourney = makeJourney('eco', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 600,
        cabin: 'economy',
        comfort: 3,
      }),
    ], []);

    const businessJourney = makeJourney('biz', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.MAN, {
        depart: '2026-09-15T10:00:00Z',
        arrive: '2026-09-15T16:00:00Z',
        price: 3000,
        cabin: 'business',
        comfort: 5,
      }),
    ], []);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: { airportQuality: 75, tzOffsetHours: 0 },
      stopovers: [],
    };

    const ecoFactors = deriveJourneyScoreFactors(economyJourney, signals);
    const bizFactors = deriveJourneyScoreFactors(businessJourney, signals);

    expect(bizFactors.cabinQuality).toBeGreaterThan(ecoFactors.cabinQuality!);
  });

  // ———— Hotel quality calculation ————
  it('hotelQuality reflects star rating and guest rating', () => {
    const hotel3Star = makeJourney('h3', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
        depart: '2026-09-15T09:00:00Z',
        arrive: '2026-09-15T13:00:00Z',
        price: 300,
      }),
      makeLeg(AIRPORTS.IST, AIRPORTS.MAN, {
        depart: '2026-09-16T10:00:00Z',
        arrive: '2026-09-16T14:00:00Z',
        price: 260,
      }),
    ], [
      {
        airport: AIRPORTS.IST,
        cityName: AIRPORTS.IST.cityName,
        countryCode: AIRPORTS.IST.countryCode,
        nights: 1,
        appealScore: 75,
        tags: [],
        headline: 'Istanbul stopover',
        highlights: [],
        hotel: makeHotel('h3', 3, 7, 1),
        alternativeHotels: [],
        transfers: {
          arrival: makeTransfer('t-in', 40, 3),
          departure: makeTransfer('t-out', 40, 3),
        },
      },
    ]);

    const hotel5Star = makeJourney('h5', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
        depart: '2026-09-15T09:00:00Z',
        arrive: '2026-09-15T13:00:00Z',
        price: 300,
      }),
      makeLeg(AIRPORTS.IST, AIRPORTS.MAN, {
        depart: '2026-09-16T10:00:00Z',
        arrive: '2026-09-16T14:00:00Z',
        price: 260,
      }),
    ], [
      {
        airport: AIRPORTS.IST,
        cityName: AIRPORTS.IST.cityName,
        countryCode: AIRPORTS.IST.countryCode,
        nights: 1,
        appealScore: 75,
        tags: [],
        headline: 'Istanbul stopover',
        highlights: [],
        hotel: makeHotel('h5', 5, 9.2, 1),
        alternativeHotels: [],
        transfers: {
          arrival: makeTransfer('t-in', 40, 3),
          departure: makeTransfer('t-out', 40, 3),
        },
      },
    ]);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: { airportQuality: 75, tzOffsetHours: 0 },
      stopovers: [{}],
    };

    const factors3 = deriveJourneyScoreFactors(hotel3Star, signals);
    const factors5 = deriveJourneyScoreFactors(hotel5Star, signals);

    expect(factors5.hotelQuality).toBeGreaterThan(factors3.hotelQuality!);
  });

  // ———— Multiple stopovers ————
  it('multiple stopovers: factors use mean over stopovers', () => {
    const journey = makeJourney('multi-stop', [
      makeLeg(AIRPORTS.DXB, AIRPORTS.IST, {
        depart: '2026-09-15T09:00:00Z',
        arrive: '2026-09-15T13:00:00Z',
        price: 300,
      }),
      makeLeg(AIRPORTS.IST, AIRPORTS.CDG, {
        depart: '2026-09-16T10:00:00Z',
        arrive: '2026-09-16T14:00:00Z',
        price: 280,
      }),
      makeLeg(AIRPORTS.CDG, AIRPORTS.MAN, {
        depart: '2026-09-17T10:00:00Z',
        arrive: '2026-09-17T12:00:00Z',
        price: 200,
      }),
    ], [
      makeStopover(AIRPORTS.IST, 1),
      makeStopover(AIRPORTS.CDG, 1),
    ]);

    const signals: JourneyScoreSignals = {
      origin: { airportQuality: 85, tzOffsetHours: 4 },
      destination: { airportQuality: 75, tzOffsetHours: 0 },
      stopovers: [
        {
          touristAppeal: 90,
          foodRating: 85,
          safety: 88,
          neighbourhoodQuality: 87,
          airportQuality: 80,
          weather: 80,
        },
        {
          touristAppeal: 92,
          foodRating: 90,
          safety: 90,
          neighbourhoodQuality: 92,
          airportQuality: 88,
          weather: 78,
        },
      ],
    };

    const factors = deriveJourneyScoreFactors(journey, signals);
    // hotelQuality should be mean of two hotels
    expect(factors.hotelQuality).not.toBeNull();
    // touristAppeal should be mean of two stopovers: (90 + 92) / 2 = 91
    expect(factors.touristAppeal).toBeCloseTo(91, 0);
  });
});
