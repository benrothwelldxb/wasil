import { useQuery } from '@tanstack/react-query';
import { getStopoverAccommodation } from '@/data/hotels';
import { stopoverAccommodationSchema } from '@/domain/hotels';
import type { HotelSearchRequest, StopoverAccommodation } from '@/domain/hotels';
import { log } from '@/lib/logger';

const logger = log.child('stopover-accommodation');

/**
 * Resolves the generic, provider-agnostic accommodation summary for a single
 * stopover. Cache key covers the request shape (city, length of stay, party,
 * date) so equivalent requests share one entry. Data is deterministic, so it
 * never goes stale.
 */
export function useStopoverAccommodation(req: HotelSearchRequest | null) {
  return useQuery<StopoverAccommodation>({
    queryKey: [
      'stopover-accommodation',
      req?.cityIata ?? 'none',
      req?.nights ?? 0,
      req?.pax.adults ?? 0,
      req?.pax.children ?? 0,
      req?.date ?? 'none',
    ],
    enabled: req != null,
    staleTime: Infinity,
    retry: 1,
    queryFn: async ({ signal }) => {
      const result = await getStopoverAccommodation(req as HotelSearchRequest, { signal });

      const parsed = stopoverAccommodationSchema.safeParse(result);
      if (parsed.success) return parsed.data;

      logger.warn('provider returned invalid stopover accommodation', {
        cityIata: (req as HotelSearchRequest).cityIata,
      });
      throw new Error('invalid stopover accommodation payload');
    },
  });
}
