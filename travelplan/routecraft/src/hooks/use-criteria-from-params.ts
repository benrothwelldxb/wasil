import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchParamsSchema } from '@/domain/schemas';
import type { SearchCriteria } from '@/domain/types';

/** Parses and validates the committed search criteria from the URL. */
export function useCriteriaFromParams(): {
  criteria: SearchCriteria | null;
  error: string | null;
} {
  const [params] = useSearchParams();

  return useMemo(() => {
    const raw = Object.fromEntries(params.entries());
    const parsed = searchParamsSchema.safeParse(raw);
    if (!parsed.success) {
      return { criteria: null, error: parsed.error.issues[0]?.message ?? 'Invalid search' };
    }
    return { criteria: parsed.data, error: null };
  }, [params]);
}
