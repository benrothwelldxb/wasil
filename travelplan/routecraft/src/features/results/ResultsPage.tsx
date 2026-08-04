import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, PlaneTakeoff } from 'lucide-react';
import { applyView } from '@/domain/view';
import { formatMoney } from '@/domain/format';
import { useCriteriaFromParams } from '@/hooks/use-criteria-from-params';
import { useJourneySearch } from '@/hooks/use-journey-search';
import { useSearchStore } from '@/stores/search-store';
import { useUiStore } from '@/stores/ui-store';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/shared/StateViews';
import { JourneyCard } from './JourneyCard';
import { FilterBar } from './FilterBar';
import { SortMenu } from './SortMenu';
import { ResultsSkeleton } from './ResultsSkeleton';

const listContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export function ResultsPage() {
  const { criteria, error } = useCriteriaFromParams();
  const loadFromCriteria = useSearchStore((s) => s.loadFromCriteria);
  const filters = useUiStore((s) => s.filters);
  const sort = useUiStore((s) => s.sort);

  const query = useJourneySearch(criteria);

  useEffect(() => {
    if (criteria) loadFromCriteria(criteria);
  }, [criteria, loadFromCriteria]);

  const visible = useMemo(
    () => (query.data ? applyView(query.data.journeys, filters, sort) : []),
    [query.data, filters, sort],
  );

  if (error || !criteria) {
    return (
      <div className="container py-10">
        <ErrorState message="This search link looks invalid. Start a fresh search." />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {criteria.origin} → {criteria.destination}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatMoney(criteria.budget)} budget · {criteria.pax.adults + criteria.pax.children}{' '}
            traveller{criteria.pax.adults + criteria.pax.children > 1 ? 's' : ''} ·{' '}
            {criteria.departureDate}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/">
            <Pencil className="h-4 w-4" />
            Edit search
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <FilterBar budget={criteria.budget} />
          </div>
        </aside>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {query.isLoading
                ? 'Crafting journeys…'
                : `${visible.length} journe${visible.length === 1 ? 'y' : 'ys'} within budget`}
            </p>
            <SortMenu />
          </div>

          {query.isLoading && <ResultsSkeleton />}

          {query.isError && <ErrorState />}

          {query.isSuccess && visible.length === 0 && (
            <EmptyState
              icon={<PlaneTakeoff className="h-10 w-10" />}
              title={
                query.data.journeys.length === 0
                  ? 'No journeys within your budget'
                  : 'No journeys match these filters'
              }
              description={
                query.data.journeys.length === 0
                  ? query.data.stats.cheapestOverBudget
                    ? `The closest journey we found costs ${formatMoney(
                        query.data.stats.cheapestOverBudget,
                      )}. Try raising your budget.`
                    : 'Try a higher budget or a different route.'
                  : 'Loosen the filters on the left to see more journeys.'
              }
              action={
                <Button asChild variant="outline">
                  <Link to="/">Adjust search</Link>
                </Button>
              }
            />
          )}

          {query.isSuccess && visible.length > 0 && (
            <motion.div
              variants={listContainer}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              <AnimatePresence mode="popLayout">
                {visible.map((journey) => (
                  <JourneyCard key={journey.id} journey={journey} />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
}
