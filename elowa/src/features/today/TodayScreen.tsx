import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { IconButton } from '@/components/common/IconButton';
import { HealthNotice } from '@/components/common/HealthNotice';
import { PrivacyNote } from '@/components/common/PrivacyNote';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { Wordmark } from '@/components/brand/Wordmark';
import { WellbeingSelector } from '@/components/product/WellbeingSelector';
import { SymptomRow, SeverityIndicator } from '@/components/product/SymptomRow';
import { ContextTagChip } from '@/components/product/ContextTagChip';
import { IconBadge } from '@/components/common/IconBadge';
import { Icon } from '@/components/ui/icon';
import { useCurrentUser, useCheckIns } from '@/hooks/queries';
import { usePinnedSymptoms } from '@/hooks/usePinnedSymptoms';
import { useCheckInDraft } from '@/store/checkInDraftStore';
import { CONTEXT_TAGS, TODAY_CONTEXT_TAG_IDS } from '@/data/catalog';
import { greetingForHour } from '@/lib/date';
import type { DailyCheckIn, Severity } from '@/domain/models';

export function TodayScreen() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: checkIns } = useCheckIns();

  const wellbeing = useCheckInDraft((s) => s.wellbeing);
  const setWellbeing = useCheckInDraft((s) => s.setWellbeing);
  const contextTagIds = useCheckInDraft((s) => s.contextTagIds);
  const toggleContextTag = useCheckInDraft((s) => s.toggleContextTag);

  // Most recent check-in provides the "current state" for the preview.
  const latest = useMemo<DailyCheckIn | undefined>(() => {
    if (!checkIns?.length) return undefined;
    return [...checkIns].sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [checkIns]);

  const severityBySymptom = useMemo(() => {
    const map = new Map<string, Severity>();
    latest?.symptoms.forEach((s) => map.set(s.symptomId, s.severity));
    return map;
  }, [latest]);

  const greeting = greetingForHour(new Date().getHours());
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const pinnedSymptoms = usePinnedSymptoms();

  const todayTags = TODAY_CONTEXT_TAG_IDS.map((id) =>
    CONTEXT_TAGS.find((t) => t.id === id),
  ).filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <Screen>
      {/* Top bar */}
      <div className="flex items-center justify-between pt-6">
        <Wordmark />
        <div className="flex items-center gap-1">
          <IconButton
            icon="CalendarDays"
            label="View history"
            variant="soft"
            onClick={() => navigate('/calendar')}
          />
          <IconButton icon="Bell" label="Reminders" variant="soft" />
        </div>
      </div>

      {/* Greeting */}
      <div className="mt-6">
        <p className="text-sm text-muted-foreground">{todayLabel}</p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground">
          {greeting}, {user?.displayName ?? 'there'}
        </h1>
      </div>

      {/* Overall wellbeing */}
      <Card className="mt-6 p-5">
        <h2 className="text-lg font-semibold text-foreground">How are you feeling today?</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">A quick sense of your overall day.</p>
        <WellbeingSelector value={wellbeing} onChange={setWellbeing} className="mt-4" />
      </Card>

      {/* Quick check-in preview */}
      <div className="mt-7">
        <SectionHeading
          action={
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="Sparkles" className="size-3.5" /> Your pinned symptoms
            </span>
          }
        >
          Today at a glance
        </SectionHeading>
        <Card className="divide-y divide-border/60 px-5 py-1">
          {pinnedSymptoms.map((symptom) => {
            const severity = severityBySymptom.get(symptom.id) ?? 'none';
            return (
              <SymptomRow
                key={symptom.id}
                symptom={symptom}
                indicator={<SeverityIndicator severity={severity} />}
              />
            );
          })}
        </Card>
        <PrimaryButton className="mt-4" onClick={() => navigate('/check-in')}>
          <Icon name="Check" className="size-5" />
          Complete check-in
        </PrimaryButton>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Takes about 15 seconds
        </p>
      </div>

      {/* Context card */}
      <Card className="mt-7 p-5">
        <div className="flex items-center gap-2">
          <IconBadge icon="Wind" size="sm" tone="accent" />
          <h2 className="text-base font-semibold text-foreground">Anything different today?</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Tag what stood out. Over time this helps surface what changed.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {todayTags.map((tag) => (
            <ContextTagChip
              key={tag.id}
              tag={tag}
              selected={contextTagIds.includes(tag.id)}
              onToggle={toggleContextTag}
            />
          ))}
        </div>
      </Card>

      {/* Quick access to the flagship history + appointment surfaces */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <QuickTile
          icon="CalendarDays"
          title="History"
          subtitle="Your calendar"
          onClick={() => navigate('/calendar')}
        />
        <QuickTile
          icon="FileText"
          title="Appointment"
          subtitle="Visit summary"
          onClick={() => navigate('/appointment')}
        />
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
      <IconBadge icon={icon} size="md" tone="brand" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}
