/**
 * Public barrel for the hotel data layer. Exposes ONLY the generic surface —
 * `HotelProvider` / `StopoverAccommodation`, the registry, and the generic
 * `CitySignals` accessor for the Journey Score domain — never the internal
 * raw supplier shape (`./raw.ts`) or the curated livability dataset
 * (`./livability.ts`). Those stay private to `src/data/hotels/**`.
 */
export { getHotelProvider, getStopoverAccommodation, resetHotelProviderForTests } from './hotel-provider-registry';
export { syntheticHotelProvider } from './SyntheticHotelProvider';
export { getCitySignals, getCityWeather } from './city-signals';
export type { CitySignals } from './city-signals';
export type { WeatherSummary } from '@/domain/hotels/types';
