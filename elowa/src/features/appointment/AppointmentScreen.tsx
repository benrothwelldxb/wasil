import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/button';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { Icon } from '@/components/ui/icon';
import { AppointmentSection } from '@/components/product/AppointmentSection';
import { TreatmentTimeline } from '@/components/product/TreatmentTimeline';
import { HealthNotice } from '@/components/common/HealthNotice';
import { useAppointmentSummary, useTreatments } from '@/hooks/queries';
import { formatDateRange } from '@/lib/date';

export function AppointmentScreen() {
  const { data: summary } = useAppointmentSummary();
  const { data: treatments } = useTreatments();

  if (!summary) {
    return (
      <>
        <ScreenHeader eyebrow="For your appointment" title="Summary" showBack />
        <Screen>
          <p className="text-sm text-muted-foreground">Preparing your summary…</p>
        </Screen>
      </>
    );
  }

  const summaryTreatments = (treatments ?? []).filter((t) =>
    summary.treatmentEventIds.includes(t.id),
  );

  return (
    <>
      <ScreenHeader
        eyebrow="For your appointment"
        title="Visit summary"
        showBack
        trailing={<Badge variant="neutral">1 page</Badge>}
      />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          A concise overview to bring to your next appointment. Designed to fit on a single page.
        </p>

        {/* The "printable page" */}
        <Card className="mt-5 p-5">
          <AppointmentSection icon="CalendarDays" title="Date range">
            <p className="text-lg font-semibold text-foreground">
              {formatDateRange(summary.rangeStart, summary.rangeEnd)}
            </p>
          </AppointmentSection>

          <AppointmentSection icon="Activity" title="Most disruptive symptoms">
            <ol className="space-y-2.5">
              {summary.mostDisruptiveSymptoms.map((s, i) => (
                <li key={s.symptomId} className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="w-32 shrink-0 text-sm font-medium text-foreground">
                    {s.label}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(s.disruption * 100)}%` }}
                    />
                  </span>
                </li>
              ))}
            </ol>
          </AppointmentSection>

          <AppointmentSection icon="CalendarClock" title="Cycle changes">
            <p className="text-sm text-muted-foreground">{summary.cycleSummary}</p>
          </AppointmentSection>

          <AppointmentSection icon="Pill" title="Treatment timeline">
            <TreatmentTimeline events={summaryTreatments} showNotes={false} />
          </AppointmentSection>

          <AppointmentSection icon="LineChart" title="Symptom trends">
            <p className="text-sm text-muted-foreground">{summary.symptomTrendNote}</p>
          </AppointmentSection>

          <AppointmentSection icon="FileText" title="Notes worth discussing">
            <ul className="space-y-2">
              {summary.discussionPoints.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-foreground">
                  <Icon name="Check" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </AppointmentSection>
        </Card>

        {/* Actions (static in Phase 0) */}
        <div className="mt-5 space-y-2.5">
          <PrimaryButton>
            <Icon name="FileText" className="size-5" />
            View full summary
          </PrimaryButton>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="outline" size="lg">
              <Icon name="Download" className="size-5" />
              Export
            </Button>
            <Button variant="outline" size="lg">
              <Icon name="Share2" className="size-5" />
              Share
            </Button>
          </div>
        </div>

        <HealthNotice className="mt-6" compact>
          This summary reflects what you recorded. It is a conversation aid for your clinician,
          not a diagnosis.
        </HealthNotice>
      </Screen>
    </>
  );
}
