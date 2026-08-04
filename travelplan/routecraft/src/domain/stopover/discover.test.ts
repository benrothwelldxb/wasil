import { describe, expect, it } from 'vitest';
import type {
  Airline,
  CabinClass,
  HotelOption,
  HotelTier,
  Leg,
  Pax,
  Transfer,
} from '@/domain/types';
import { journeySchema } from '@/domain/schemas';
import { heuristicRecommender } from './recommend';
import { discoverStopoverJourneys } from './discover';
import type {
  CandidateCity,
  DiscoveryDeps,
  DiscoveryRequest,
  FlightSearchPort,
  FlightSearchRequest,
  HotelEstimateRequest,
  HotelEstimatorPort,
} from './types';

// ——— fixtures: a DXB → MAN routing with a cheap, legitimate IST stopover,
// a DOH stopover whose REAL (constructed) price is far higher than its cheap
// shortlist estimate (must be dropped by the hard budget filter), and a CAI
// stopover with no inbound availability (must be skipped, not crash). ———

const money = (amount: number) => ({ amount, currency: 'USD' as const });

const AIRLINE: Airline = { code: 'MR', name: 'Meridian Air', comfortRating: 4 };

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Deterministic per-route flight number so repeated runs are byte-identical. */
function flightNumberFor(from: string, to: string): string {
  const seed = `${from}${to}`.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return `MR${100 + (seed % 900)}`;
}

function makeLeg(req: FlightSearchRequest, opts: { price: number; duration: number; depHour: number }): Leg {
  const departure = `${req.date}T${pad2(opts.depHour)}:00:00.000Z`;
  const arrival = addMinutesIso(departure, opts.duration);
  return {
    id: `leg-${req.from}-${req.to}`,
    from: { iata: req.from, cityName: req.from, countryCode: 'XX' },
    to: { iata: req.to, cityName: req.to, countryCode: 'XX' },
    departure,
    arrival,
    durationMinutes: opts.duration,
    airline: AIRLINE,
    flightNumber: flightNumberFor(req.from, req.to),
    cabin: req.cabin,
    aircraft: 'A320',
    isRedEye: false,
    pricePerPax: money(opts.price),
  };
}

interface RouteSpec {
  price: number;
  duration: number;
  depHour: number;
}

const ROUTES: Record<string, RouteSpec[]> = {
  'DXB-MAN': [{ price: 900, duration: 439, depHour: 9 }],
  'DXB-IST': [{ price: 220, duration: 250, depHour: 8 }],
  'IST-MAN': [{ price: 260, duration: 260, depHour: 10 }],
  'DXB-DOH': [{ price: 500, duration: 90, depHour: 8 }],
  'DOH-MAN': [{ price: 550, duration: 430, depHour: 10 }],
  // CAI has no inbound availability at all — the engine must skip it.
  'DXB-CAI': [],
};

const fakeFlightSearch: FlightSearchPort = {
  async search(req: FlightSearchRequest): Promise<Leg[]> {
    const specs = ROUTES[`${req.from}-${req.to}`] ?? [];
    return specs.map((s) => makeLeg(req, s));
  },
};

interface HotelSpec {
  perNight: number;
  tier: HotelTier;
}

const HOTELS: Record<string, HotelSpec> = {
  IST: { perNight: 90, tier: 'midscale' },
  DOH: { perNight: 700, tier: 'upscale' },
};

function makeHotel(id: string, cityIata: string, spec: HotelSpec, rooms: number, nights: number): HotelOption {
  return {
    id,
    name: `${cityIata} Hotel ${id}`,
    tier: spec.tier,
    starRating: spec.tier === 'upscale' ? 5 : 4,
    guestRating: 8.4,
    neighborhood: 'Center',
    pricePerNight: money(spec.perNight),
    totalPrice: money(spec.perNight * rooms * nights),
    amenities: ['wifi'],
  };
}

function makeTransfer(id: string): Transfer {
  return {
    id,
    mode: 'taxi',
    from: 'Airport',
    to: 'Hotel',
    durationMinutes: 25,
    price: money(20),
    comfortRating: 4,
  };
}

const fakeHotelEstimator: HotelEstimatorPort = {
  async estimate(req: HotelEstimateRequest) {
    const spec = HOTELS[req.city.iata];
    if (!spec) throw new Error(`no hotel fixture for ${req.city.iata}`);
    const hotel = makeHotel('h-main', req.city.iata, spec, req.rooms, req.nights);
    const alt = makeHotel('h-alt', req.city.iata, { ...spec, tier: 'budget' as HotelTier }, req.rooms, req.nights);
    return {
      hotel,
      alternativeHotels: [alt],
      transfers: { arrival: makeTransfer('t-arr'), departure: makeTransfer('t-dep') },
    };
  },
};

const DXB: CandidateCity = {
  iata: 'DXB',
  cityName: 'Dubai',
  countryCode: 'AE',
  lat: 25.2532,
  lon: 55.3657,
  hubStrength: 5,
  appealScore: 70,
  tags: [],
  hotelBaseNightly: money(120),
  headline: 'Origin',
  highlights: [],
};

const MAN: CandidateCity = {
  iata: 'MAN',
  cityName: 'Manchester',
  countryCode: 'GB',
  lat: 53.3537,
  lon: -2.275,
  hubStrength: 3,
  appealScore: 50,
  tags: [],
  hotelBaseNightly: money(100),
  headline: 'Destination',
  highlights: [],
};

const IST: CandidateCity = {
  iata: 'IST',
  cityName: 'Istanbul',
  countryCode: 'TR',
  lat: 41.2753,
  lon: 28.7519,
  hubStrength: 5,
  appealScore: 85,
  tags: ['culture', 'food'],
  hotelBaseNightly: money(90),
  headline: 'Istanbul stopover',
  highlights: ['Blue Mosque', 'Grand Bazaar'],
};

/** Cheap shortlist estimate assumes ~$150/night; the real quoted rate is $700/night. */
const DOH: CandidateCity = {
  iata: 'DOH',
  cityName: 'Doha',
  countryCode: 'QA',
  lat: 25.2731,
  lon: 51.608,
  hubStrength: 4,
  appealScore: 60,
  tags: ['shopping'],
  hotelBaseNightly: money(150),
  headline: 'Doha stopover',
  highlights: ['Souq Waqif'],
};

const CAI: CandidateCity = {
  iata: 'CAI',
  cityName: 'Cairo',
  countryCode: 'EG',
  lat: 30.1219,
  lon: 31.4056,
  hubStrength: 4,
  appealScore: 55,
  tags: ['culture'],
  hotelBaseNightly: money(100),
  headline: 'Cairo stopover',
  highlights: ['Pyramids'],
};

const CITY_POOL: CandidateCity[] = [DXB, MAN, IST, DOH, CAI];

const PAX: Pax = { adults: 1, children: 0 };
const CABIN: CabinClass = 'economy';

function baseRequest(overrides: Partial<DiscoveryRequest> = {}): DiscoveryRequest {
  return {
    origin: 'DXB',
    destination: 'MAN',
    maxStopovers: 2,
    maxStopoverNights: 2,
    budget: money(1800),
    departureDate: '2026-09-15',
    pax: PAX,
    cabin: CABIN,
    preferences: [],
    ...overrides,
  };
}

function buildDeps(): DiscoveryDeps {
  return {
    recommender: heuristicRecommender,
    cityPool: CITY_POOL,
    flightSearch: fakeFlightSearch,
    hotelEstimator: fakeHotelEstimator,
  };
}

describe('discoverStopoverJourneys', () => {
  it('returns ranked journeys including a direct baseline', async () => {
    const result = await discoverStopoverJourneys(baseRequest(), buildDeps());

    expect(result.journeys.length).toBeGreaterThan(0);
    expect(result.journeys.some((j) => j.kind === 'direct')).toBe(true);
    expect(result.journeys.some((j) => j.kind === 'stopover')).toBe(true);
  });

  it('every returned journey validates against journeySchema', async () => {
    const result = await discoverStopoverJourneys(baseRequest(), buildDeps());
    for (const journey of result.journeys) {
      const parsed = journeySchema.safeParse(journey);
      expect(parsed.success).toBe(true);
    }
  });

  it('honours "direct only" (maxStopovers=0): no stopover journeys, no candidate discovery', async () => {
    const result = await discoverStopoverJourneys(baseRequest({ maxStopovers: 0 }), buildDeps());

    expect(result.journeys.length).toBeGreaterThan(0);
    expect(result.journeys.every((j) => j.kind === 'direct')).toBe(true);
    expect(result.journeys.some((j) => j.stopovers.length > 0)).toBe(false);
    // Candidate discovery was skipped entirely.
    expect(result.diagnostics.shortlisted).toBe(0);
    expect(result.journeys.every((j) => j.criteria.maxStopovers === 0)).toBe(true);
  });

  it('drops the over-budget DOH stopover (real cost far exceeds the cheap estimate)', async () => {
    const result = await discoverStopoverJourneys(baseRequest(), buildDeps());

    expect(result.journeys.some((j) => j.id.startsWith('stopover-DOH'))).toBe(false);
    expect(result.diagnostics.overBudgetFiltered).toBeGreaterThan(0);
    expect(result.diagnostics.cheapestOverBudget).toBeDefined();
  });

  it('recomputes cost rather than trusting the recommendation estimate', async () => {
    const request = baseRequest();
    const deps = buildDeps();
    const recs = await heuristicRecommender.recommend(request, deps.cityPool);
    const istRec = recs.find((r) => r.city.iata === 'IST');
    expect(istRec).toBeDefined();

    const result = await discoverStopoverJourneys(request, deps);
    const istJourney = result.journeys.find((j) => j.id.startsWith('stopover-IST'));
    expect(istJourney).toBeDefined();

    // Real construction (220 + 260 flights + 180 hotel + 40 transfers = 700)
    // must not equal the cheap shortlist estimate used only for gating/rank.
    expect(istJourney!.cost.total.amount).not.toBe(istRec!.estimatedTotal.amount);
    expect(istJourney!.cost.total.amount).toBeCloseTo(700, 0);
  });

  it('skips a candidate whose flight search returns no legs (CAI)', async () => {
    const result = await discoverStopoverJourneys(baseRequest(), buildDeps());

    expect(result.journeys.some((j) => j.id.startsWith('stopover-CAI'))).toBe(false);
    // CAI passed the cheap-estimate gate (shortlisted by the recommender) but
    // never became a constructed journey.
    expect(result.diagnostics.gated).toBeGreaterThan(result.diagnostics.shortlisted);
  });

  it('surfaces the cheap, legitimate IST stopover ranked above the direct flight', async () => {
    const result = await discoverStopoverJourneys(baseRequest(), buildDeps());

    const stopoverIndex = result.journeys.findIndex((j) => j.id.startsWith('stopover-IST'));
    const directIndex = result.journeys.findIndex((j) => j.kind === 'direct');

    expect(stopoverIndex).toBeGreaterThanOrEqual(0);
    expect(directIndex).toBeGreaterThanOrEqual(0);
    expect(stopoverIndex).toBeLessThan(directIndex);
  });

  it('is deterministic across repeated runs', async () => {
    const a = await discoverStopoverJourneys(baseRequest(), buildDeps());
    const b = await discoverStopoverJourneys(baseRequest(), buildDeps());
    expect(a).toEqual(b);
  });
});
