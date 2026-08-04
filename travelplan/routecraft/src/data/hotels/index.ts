/**
 * Public barrel for the hotel data layer. Exposes ONLY the generic surface —
 * `HotelProvider` / `StopoverAccommodation` and the registry — never the
 * internal raw supplier shape (`./raw.ts`) or the curated livability dataset
 * (`./livability.ts`). Those stay private to `src/data/hotels/**`.
 */
export { getHotelProvider, getStopoverAccommodation, resetHotelProviderForTests } from './hotel-provider-registry';
export { syntheticHotelProvider } from './SyntheticHotelProvider';
