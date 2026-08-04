import type { ExperienceFactorKey, ExperienceScore } from '@/domain/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FACTOR_LABELS: Record<ExperienceFactorKey, string> = {
  stopoverAppeal: 'Stopover appeal',
  comfort: 'Comfort',
  travelTimeEfficiency: 'Travel-time efficiency',
  layoverQuality: 'Connection quality',
  valueForMoney: 'Value for money',
  scheduleConvenience: 'Schedule convenience',
};

const FACTOR_ORDER: ExperienceFactorKey[] = [
  'stopoverAppeal',
  'comfort',
  'travelTimeEfficiency',
  'layoverQuality',
  'valueForMoney',
  'scheduleConvenience',
];

export function ScoreExplainer({ score }: { score: ExperienceScore }) {
  return (
    <Accordion type="single" collapsible defaultValue="why">
      <AccordionItem value="why" className="border-none">
        <AccordionTrigger className="text-base font-semibold">
          Why this scores {score.total}
        </AccordionTrigger>
        <AccordionContent>
          <p className="mb-4 text-sm text-muted-foreground">{score.narrative}</p>
          <ul className="space-y-3">
            {FACTOR_ORDER.map((key) => {
              const value = Math.round(score.factors[key]);
              const weightPct = Math.round(score.weights[key] * 100);
              return (
                <li key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{FACTOR_LABELS[key]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {value}
                      <span className="ml-2 text-xs">· {weightPct}% weight</span>
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
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
