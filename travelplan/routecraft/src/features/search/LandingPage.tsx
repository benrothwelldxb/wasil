import { useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';
import { Compass, Sparkles } from 'lucide-react';
import { criteriaToResultsPath } from '@/domain/url';
import { useSearchStore } from '@/stores/search-store';
import { Card } from '@/components/ui/card';
import { MOTION } from '@/lib/motion';
import { SearchForm } from './SearchForm';
import { EXAMPLE_SEARCHES } from './examples';

export function LandingPage() {
  const navigate = useNavigate();
  const loadFromCriteria = useSearchStore((s) => s.loadFromCriteria);

  return (
    <div className="container py-10 lg:py-16">
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION.base, ease: MOTION.ease }}
        className="mx-auto max-w-3xl text-center"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Experience-first journey discovery
        </span>
        <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          I don&apos;t care how I get there.
          <span className="block text-primary">Find me the best trip within my budget.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
          RouteCraft discovers stopover cities, adds hotels and transfers, and ranks whole
          journeys by experience — not just the cheapest flight.
        </p>
      </m.div>

      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION.base, ease: MOTION.ease, delay: 0.1 }}
        className="mx-auto mt-10 max-w-4xl"
      >
        <Card className="p-6 shadow-lg sm:p-8">
          <SearchForm />
        </Card>
      </m.div>

      <div className="mx-auto mt-8 max-w-4xl">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Compass className="h-4 w-4" />
          Try an example
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {EXAMPLE_SEARCHES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                loadFromCriteria(ex.criteria);
                navigate(criteriaToResultsPath(ex.criteria));
              }}
              className="group rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="font-semibold group-hover:text-primary">{ex.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{ex.tagline}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
