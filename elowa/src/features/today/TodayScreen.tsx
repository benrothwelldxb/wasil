import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { IconButton } from '@/components/common/IconButton';
import { HealthNotice } from '@/components/common/HealthNotice';
import { PrivacyNote } from '@/components/common/PrivacyNote';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { Wordmark } from '@/components/brand/Wordmark';
import { ContextTagChip } from '@/components/product/ContextTagChip';
import { InsightCard } from '@/components/product/InsightCard';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/common/EmptyState';
import {
  useAnalysis,
  useCheckInByDate,
  useCurrentUser,
  useDueNotifications,
  useHomeInsights,
  useLatestHealthSample,
  useSaveCheckIn,
} from '@/hooks/queries';
import { CONTEXT_TAGS, QUICK_CONTEXT_TAG_IDS } from '@/data/catalog';
import { buildNormalCheckIn } from '@/features/checkin/buildCheckIn';
import { greetingForHour, todayIso } from '@/lib/date';
import { BASELINE } from '@/domain/analysis/thresholds';

export function TodayScreen() {
  const navigate = useNavigate();
  const today = todayIso();
  const { data: user } = useCurrentUser();
  const { data: analysis } = useAnalysis();
  const { data: insights } = useHomeInsights();
  const { data: todayCheckIn } = useCheckInByDate(today);
  const { data: latestSample } = useLatestHealthSample();
  const { data: dueNotifications } = useDueNotifications();
  const save = useSaveCheckIn();

  const [normalOpen, setNormalOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  const greeting = greetingForHour(new Date().getHours());
  const name = user?.profile.displayName;
  const overall = analysis?.overall;
  const distinct = overall?.distinctDays ?? 0;

  const changedCount = analysis
    ? [...analysis.symptoms.values()].filter(
        (a) => a.baseline.state === 'recalibrating' || a.baseline.recentMean - a.baseline.mean >= 0.6,
      ).length
    : 0;

  const quickTags = QUICK_CONTEXT_TAG_IDS.map((id) => CONTEXT_TAGS.find((t) => t.id === id)).filter(
    (t): t is NonNullable<typeof t> => Boolean(t),
  );

  const saveNormal = () => {
    save.mutate(buildNormalCheckIn(today, tags, ''), {
      onSuccess: () => {
        setNormalOpen(false);
        setTags([]);
      },
    });
  };

  const statusLine = (() => {
    if (distinct === 0) return 'Let’s learn what’s normal for you.';
    if (overall?.state === 'learning')
      return `elowa is learning your baseline — ${distinct} check-in${distinct === 1 ? '' : 's'} recorded.`;
    return changedCount > 0 ? 'A few things look different lately.' : 'Things look steady lately.';
  })();

  return (
    <Screen>
      {/* Top bar */}
      <div className="flex items-center justify-between pt-6">
        <Wordmark />
        <div className="flex items-center gap-1">
          <IconButton icon="CalendarDays" label="View history" variant="soft" onClick={() => navigate('/calendar')} />
          <IconButton icon="Settings2" label="Settings" variant="soft" onClick={() => navigate('/profile')} />
        </div>
      </div>

      {/* Greeting */}
      <div className="mt-6">
        <h1 className="text-3xl font-semibold text-foreground">
          {greeting}
          {name ? `, ${name}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{statusLine}</p>
      </div>

      {/* Baseline learning progress */}
      {overall && overall.state !== 'established' && distinct > 0 ? (
        <Card className="mt-5 p-4">
          <div className="flex items-center gap-2">
            <Icon name="Sparkles" className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Learning your baseline</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            The more you check in, the more useful your patterns become.
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (distinct / BASELINE.LEARNING_TARGET_DAYS) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {distinct} of {BASELINE.LEARNING_TARGET_DAYS} days
          </p>
        </Card>
      ) : null}

      {/* Primary interaction */}
      {todayCheckIn ? (
        <Card className="mt-6 p-5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-success/15 text-success">
              <Icon name="Check" className="size-5" />
            </span>
            <p className="text-base font-semibold text-foreground">
              {todayCheckIn.feltNormal ? 'You logged a normal day' : 'You logged today’s check-in'}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            You can update it any time from your history.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/calendar')}>
            View today
          </Button>
        </Card>
      ) : normalOpen ? (
        <Card className="mt-6 p-5">
          <p className="text-base font-semibold text-foreground">Anything worth noting?</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Optional — tap any that apply.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickTags.map((tag) => (
              <ContextTagChip
                key={tag.id}
                tag={tag}
                selected={tags.includes(tag.id)}
                onToggle={(id) =>
                  setTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
                }
              />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <PrimaryButton onClick={saveNormal} disabled={save.isPending}>
              Save normal day
            </PrimaryButton>
            <Button variant="ghost" size="lg" onClick={() => setNormalOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => setNormalOpen(true)}
            className="flex w-full items-center gap-3 rounded-2xl bg-primary p-5 text-left text-primary-foreground shadow-card transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary-foreground/15">
              <Icon name="Check" className="size-6" />
            </span>
            <span className="flex-1">
              <span className="block text-lg font-semibold">Today feels normal</span>
              <span className="block text-sm text-primary-foreground/80">
                Within my usual range — logs in seconds
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/check-in')}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card p-5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-coral/20 text-foreground">
              <Icon name="Waves" className="size-6" />
            </span>
            <span className="flex-1">
              <span className="block text-lg font-semibold text-foreground">Something feels different</span>
              <span className="block text-sm text-muted-foreground">Tell elowa what’s changed</span>
            </span>
            <Icon name="ChevronRight" className="size-5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Passive sleep (subtle) */}
      {latestSample?.sleepMinutes ? (
        <Card className="mt-4 flex items-center gap-3 p-4">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="Moon" className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Sleep (from your health data)</p>
            <p className="text-base font-semibold text-foreground">
              {Math.floor(latestSample.sleepMinutes / 60)}h {latestSample.sleepMinutes % 60}m
            </p>
          </div>
          <span className="text-xs text-muted-foreground">last night</span>
        </Card>
      ) : null}

      {/* A single gentle reminder, if any */}
      {dueNotifications && dueNotifications.length > 0 ? (
        <Card className="mt-4 flex items-start gap-3 bg-secondary/50 p-4">
          <Icon name="Bell" className="mt-0.5 size-4 text-primary" />
          <p className="flex-1 text-sm text-muted-foreground">{dueNotifications[0]!.body}</p>
        </Card>
      ) : null}

      {/* One useful insight */}
      {insights && insights.length > 0 ? (
        <div className="mt-8">
          <SectionHeading
            action={
              <button className="text-sm text-primary" onClick={() => navigate('/insights')}>
                See all
              </button>
            }
          >
            Worth noticing
          </SectionHeading>
          <InsightCard insight={insights[0]!} />
        </div>
      ) : distinct > 0 && distinct < BASELINE.MIN_DAYS ? (
        <EmptyState
          className="mt-8"
          icon="LineChart"
          title="Patterns are on their way"
          description="Keep checking in — insights appear once elowa has enough to compare."
        />
      ) : null}

      {/* Quick access */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <QuickTile icon="Activity" title="What changed" subtitle="Since an event" onClick={() => navigate('/since')} />
        <QuickTile icon="CalendarDays" title="Your month" subtitle="Reflection" onClick={() => navigate('/reflection')} />
        <QuickTile icon="Droplet" title="Cycle" subtitle="Periods & history" onClick={() => navigate('/cycle')} />
        <QuickTile icon="FileText" title="Appointment" subtitle="Visit summary" onClick={() => navigate('/appointment')} />
      </div>

      <HealthNotice className="mt-7" compact />
      <PrivacyNote className="mt-4" />
    </Screen>
  );
}

function QuickTile({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-card transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon name={icon} className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}
