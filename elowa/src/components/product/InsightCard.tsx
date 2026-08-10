import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Sparkline } from './Sparkline';
import type { Insight, InsightFeedbackValue, InsightTone, PatternStrength } from '@/domain/models';
import { cn } from '@/lib/utils';

const TONE_META: Record<InsightTone, { icon: string; iconClass: string; spark: string }> = {
  positive: { icon: 'ArrowRight', iconClass: 'text-success bg-success/15', spark: 'stroke-success' },
  neutral: { icon: 'LineChart', iconClass: 'text-primary bg-primary-soft', spark: 'stroke-primary' },
  watch: { icon: 'Info', iconClass: 'text-coral bg-coral/15', spark: 'stroke-coral' },
};

const STRENGTH_LABEL: Record<PatternStrength, string> = {
  early: 'Early pattern',
  recurring: 'Recurring pattern',
  strong: 'Strong pattern',
};

/**
 * A single deterministic insight card: quality state, expandable evidence
 * ("Why am I seeing this?") + "What this means", an optional Learn link, and
 * optional feedback controls.
 */
export function InsightCard({
  insight,
  learnTitle,
  feedback,
  onFeedback,
}: {
  insight: Insight;
  /** Title of the linked Learn article, if any. */
  learnTitle?: string;
  feedback?: InsightFeedbackValue;
  onFeedback?: (value: InsightFeedbackValue) => void;
}) {
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
            <Badge variant={insight.strength === 'early' ? 'neutral' : 'default'}>
              {STRENGTH_LABEL[insight.strength]}
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
            <div className="mt-2 space-y-2 rounded-xl bg-muted/60 p-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{insight.explanation}</p>
              </div>
              {insight.whatThisMeans ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What this means</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{insight.whatThisMeans}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {insight.learnSlug && learnTitle ? (
            <Link
              to={`/learn/${insight.learnSlug}`}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Icon name="BookOpen" className="size-3.5" />
              {learnTitle}
            </Link>
          ) : null}

          {onFeedback ? (
            <div className="mt-3 flex items-center gap-1.5 border-t border-border/50 pt-3">
              <span className="mr-1 text-[11px] text-muted-foreground">Was this useful?</span>
              <FeedbackButton icon="Check" label="Helpful" active={feedback === 'helpful'} onClick={() => onFeedback('helpful')} />
              <FeedbackButton icon="Minus" label="Not useful" active={feedback === 'not_useful'} onClick={() => onFeedback('not_useful')} />
              <FeedbackButton icon="X" label="Doesn't feel right" active={feedback === 'wrong'} onClick={() => onFeedback('wrong')} />
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function FeedbackButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-8 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}
