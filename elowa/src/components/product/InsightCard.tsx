import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Sparkline } from './Sparkline';
import type { Insight, InsightTone } from '@/domain/models';
import { cn } from '@/lib/utils';

const TONE_META: Record<InsightTone, { icon: string; iconClass: string; spark: string }> = {
  positive: { icon: 'ArrowRight', iconClass: 'text-success bg-success/15', spark: 'stroke-success' },
  neutral: { icon: 'LineChart', iconClass: 'text-primary bg-primary-soft', spark: 'stroke-primary' },
  watch: { icon: 'Info', iconClass: 'text-coral bg-coral/15', spark: 'stroke-coral' },
};

/** A single deterministic insight card with an expandable evidence explanation. */
export function InsightCard({ insight }: { insight: Insight }) {
  const [showWhy, setShowWhy] = useState(false);
  const tone = TONE_META[insight.tone];

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', tone.iconClass)}>
          <Icon name={tone.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={insight.confidence === 'recurring_pattern' ? 'default' : 'neutral'}>
              {insight.confidence === 'recurring_pattern' ? 'Recurring pattern' : 'Early signal'}
            </Badge>
            {insight.framing ? (
              <span className="text-xs italic text-muted-foreground">{insight.framing}</span>
            ) : null}
          </div>
          <h3 className="text-base font-semibold leading-snug text-foreground">{insight.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{insight.body}</p>

          {insight.spark ? (
            <div className="mt-3">
              <Sparkline values={insight.spark} strokeClass={tone.spark} />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            aria-expanded={showWhy}
            className="mt-3 inline-flex items-center gap-1 rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Icon name="CircleHelp" className="size-3.5" />
            Why am I seeing this?
            <Icon name={showWhy ? 'ChevronDown' : 'ChevronRight'} className="size-3.5" />
          </button>
          {showWhy ? (
            <p className="mt-2 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              {insight.explanation}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
