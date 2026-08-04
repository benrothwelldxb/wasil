/**
 * User-adjustable Journey Score panel: the live composite total, a
 * contributions breakdown, and an "Adjust weighting" accordion with one
 * slider per factor. Reweighting recomputes the score live via the pure
 * domain functions in `@/domain/journey-score`; the raw slider values persist
 * in `useJourneyScoreStore`.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  computeJourneyScore,
  deriveJourneyScoreFactors,
  JOURNEY_SCORE_FACTORS,
  JOURNEY_SCORE_FACTOR_LABELS,
  normalizeWeights,
} from '@/domain/journey-score';
import type { JourneyScoreFactorKey } from '@/domain/journey-score';
import type { Journey } from '@/domain/types';
import { buildJourneyScoreSignals } from '@/data/journey-score/signals';
import { useJourneyScoreStore } from '@/stores/journey-score-store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/** Importances are raw, non-negative weights on a 0–1 scale (see the store). */
const IMPORTANCE_MIN = 0;
const IMPORTANCE_MAX = 1;
const IMPORTANCE_STEP = 0.01;

interface WeightSliderProps {
  factor: JourneyScoreFactorKey;
  label: string;
  value: number;
  onValueChange: (value: number) => void;
}

/**
 * The `Slider` primitive's Radix `Thumb` only picks up an `aria-label` passed
 * directly to itself — a prop `components/ui/slider` doesn't expose — so an
 * `aria-label` given to `<Slider>` lands on the (non-interactive) root
 * instead of the focusable `role="slider"` thumb. Rather than edit the
 * read-only primitive, the accessible name is set imperatively on the
 * rendered thumb, which is a legitimate DOM node reachable from this
 * component's own ref.
 */
function WeightSlider({ factor, label, value, onValueChange }: WeightSliderProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const thumb = containerRef.current?.querySelector('[role="slider"]');
    thumb?.setAttribute('aria-label', `${label} importance`);
  });

  return (
    <Slider
      ref={containerRef}
      data-testid={`weight-slider-${factor}`}
      min={IMPORTANCE_MIN}
      max={IMPORTANCE_MAX}
      step={IMPORTANCE_STEP}
      value={[value]}
      onValueChange={([next]) => onValueChange(next ?? 0)}
    />
  );
}

export function JourneyScorePanel({ journey }: { journey: Journey }) {
  const importances = useJourneyScoreStore((s) => s.importances);
  const setImportance = useJourneyScoreStore((s) => s.setImportance);
  const resetImportances = useJourneyScoreStore((s) => s.resetImportances);

  const signals = useMemo(() => buildJourneyScoreSignals(journey), [journey]);
  const factors = useMemo(() => deriveJourneyScoreFactors(journey, signals), [journey, signals]);
  const weights = useMemo(() => normalizeWeights(importances), [importances]);
  const score = useMemo(() => computeJourneyScore(factors, weights), [factors, weights]);

  return (
    <Card className="space-y-5 p-5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Journey Score</h2>
          <span
            className="text-3xl font-bold tabular-nums"
            aria-label={`Journey score: ${score.total} out of 100`}
            data-testid="journey-score-total"
          >
            {score.total}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{score.narrative}</p>
      </div>

      <ul className="space-y-3" aria-label="Score breakdown by factor">
        {score.contributions.map((c) => {
          const label = JOURNEY_SCORE_FACTOR_LABELS[c.factor];
          if (c.value === null) {
            return (
              <li key={c.factor} className="flex items-center justify-between text-sm opacity-40">
                <span>{label}</span>
                <span className="text-xs text-muted-foreground">not applicable</span>
              </li>
            );
          }
          const value = Math.round(c.value);
          return (
            <li key={c.factor} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {value}
                  <span className="ml-2 text-xs">· {Math.round(c.weight * 100)}% weight</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{ width: `${value}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <Accordion type="single" collapsible>
        <AccordionItem value="adjust" className="border-none">
          <AccordionTrigger className="text-sm font-semibold">Adjust weighting</AccordionTrigger>
          <AccordionContent>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Raise or lower how much each factor counts toward the score.
              </p>
              <Button variant="ghost" size="sm" onClick={resetImportances}>
                Reset
              </Button>
            </div>
            <ul className="space-y-4">
              {JOURNEY_SCORE_FACTORS.map((factor) => {
                const label = JOURNEY_SCORE_FACTOR_LABELS[factor];
                // Defensive default: a persisted state from an older schema (or a
                // future 13th factor) may lack a key; `normalizeWeights` copes, so
                // the slider should too rather than throwing.
                const importance = importances[factor] ?? 0;
                return (
                  <li key={factor} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {importance.toFixed(2)}
                      </span>
                    </div>
                    <WeightSlider
                      factor={factor}
                      label={label}
                      value={importance}
                      onValueChange={(value) => setImportance(factor, value)}
                    />
                  </li>
                );
              })}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
