import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Sparkline } from './Sparkline';
import type { Insight, InsightTone } from '@/domain/models';
import { cn } from '@/lib/utils';

const TONE_META: Record<InsightTone, { icon: string; iconClass: string; spark: string }> = {
  positive: { icon: 'ArrowRight', iconClass: 'text-success bg-success/15', spark: 'stroke-success' },
  neutral: { icon: 'LineChart', iconClass: 'text-primary bg-primary-soft', spark: 'stroke-primary' },
  watch: { icon: 'Info', iconClass: 'text-warning bg-warning/15', spark: 'stroke-warning' },
};

/**
 * A single insight card. Always shows the "Example" badge in Phase 0 and uses
 * cautious, association-based language from the data model.
 */
export function InsightCard({ insight }: { insight: Insight }) {
  const tone = TONE_META[insight.tone];
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            tone.iconClass,
          )}
        >
          <Icon name={tone.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {insight.isExample ? <Badge variant="example">Example</Badge> : null}
            {insight.framing ? (
              <span className="text-xs italic text-muted-foreground">{insight.framing}</span>
            ) : null}
          </div>
          <h3 className="text-base font-semibold leading-snug text-foreground">
            {insight.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{insight.body}</p>
          {insight.spark ? (
            <div className="mt-3">
              <Sparkline values={insight.spark} strokeClass={tone.spark} />
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
