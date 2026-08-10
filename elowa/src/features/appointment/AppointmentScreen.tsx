import { useState } from 'react';
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
import { EmptyState } from '@/components/common/EmptyState';
import {
  useAppointmentSummary,
  useSetAppointmentQuestions,
  useTreatments,
} from '@/hooks/queries';
import { downloadExport } from '@/services/dataManagement';
import { formatDateRange } from '@/lib/date';

export function AppointmentScreen() {
  const { data: summary } = useAppointmentSummary();
  const { data: treatments } = useTreatments();
  const setQuestions = useSetAppointmentQuestions();
  const [newQuestion, setNewQuestion] = useState('');

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

  if (summary.checkInCount === 0) {
    return (
      <>
        <ScreenHeader eyebrow="For your appointment" title="Visit summary" showBack />
        <Screen>
          <EmptyState
            icon="FileText"
            title="Nothing to summarise yet"
            description="Once you’ve recorded a few check-ins, elowa can prepare a summary to bring to an appointment."
          />
        </Screen>
      </>
    );
  }

  const summaryTreatments = (treatments ?? []).filter((t) => summary.treatmentEventIds.includes(t.id));

  const addQuestion = () => {
    const q = newQuestion.trim();
    if (!q) return;
    setQuestions.mutate([...summary.questions, q]);
    setNewQuestion('');
  };
  const removeQuestion = (index: number) => {
    setQuestions.mutate(summary.questions.filter((_, i) => i !== index));
  };

  return (
    <>
      <ScreenHeader
        eyebrow="For your appointment"
        title="Visit summary"
        showBack
        trailing={<Badge variant="neutral">1–2 pages</Badge>}
      />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          A concise overview built from your check-ins to bring to your next appointment.
        </p>

        {/* Printable region */}
        <div id="appointment-print">
          <Card className="mt-5 p-5">
            <div className="mb-3 hidden print:block">
              <h1 className="font-display text-2xl font-semibold text-primary">elowa — visit summary</h1>
            </div>

            <AppointmentSection icon="CalendarDays" title="Overview">
              <p className="text-sm text-foreground">
                {formatDateRange(summary.rangeStart, summary.rangeEnd)} · {summary.checkInCount}{' '}
                check-ins across {summary.daysTracked} days.
              </p>
            </AppointmentSection>

            {summary.changes.length > 0 ? (
              <AppointmentSection icon="Activity" title="What changed">
                <ul className="space-y-1.5">
                  {summary.changes.map((c) => (
                    <li key={c.symptomId} className="flex items-start gap-2 text-sm text-foreground">
                      <Icon
                        name={c.direction === 'up' ? 'ArrowRight' : 'Check'}
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      <span>{c.description}</span>
                    </li>
                  ))}
                </ul>
              </AppointmentSection>
            ) : null}

            {summary.mostDisruptive.length > 0 ? (
              <AppointmentSection icon="LineChart" title="Most frequently disruptive">
                <ol className="space-y-2.5">
                  {summary.mostDisruptive.map((s, i) => (
                    <li key={s.symptomId} className="flex items-center gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span className="w-36 shrink-0 text-sm font-medium text-foreground">{s.label}</span>
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
            ) : null}

            <AppointmentSection icon="CalendarClock" title="Cycle changes">
              <p className="text-sm text-muted-foreground">{summary.cycleSummary}</p>
            </AppointmentSection>

            {summaryTreatments.length > 0 ? (
              <AppointmentSection icon="Pill" title="Treatment timeline">
                <TreatmentTimeline events={summaryTreatments} showNotes={false} />
              </AppointmentSection>
            ) : null}

            {summary.observedPatterns.length > 0 ? (
              <AppointmentSection icon="Sparkles" title="Observed patterns">
                <ul className="space-y-1.5">
                  {summary.observedPatterns.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-foreground">
                      <Icon name="Info" className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs italic text-muted-foreground">
                  These are associations in recorded data, not causes.
                </p>
              </AppointmentSection>
            ) : null}

            {summary.notes.length > 0 ? (
              <AppointmentSection icon="Pencil" title="Your notes">
                <ul className="space-y-1.5">
                  {summary.notes.map((n) => (
                    <li key={n.date} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{n.date}:</span> {n.text}
                    </li>
                  ))}
                </ul>
              </AppointmentSection>
            ) : null}

            {summary.questions.length > 0 ? (
              <AppointmentSection icon="CircleHelp" title="Questions for my appointment">
                <ul className="space-y-1.5">
                  {summary.questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <Icon name="Check" className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="flex-1">{q}</span>
                      <button
                        type="button"
                        onClick={() => removeQuestion(i)}
                        aria-label={`Remove question: ${q}`}
                        className="no-print -my-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-attention focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon name="X" className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </AppointmentSection>
            ) : null}
          </Card>
        </div>

        {/* Add a question */}
        <Card className="no-print mt-4 p-4">
          <p className="text-sm font-semibold text-foreground">Add a question</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addQuestion()}
              placeholder="Something to ask your clinician…"
              aria-label="New appointment question"
              className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button variant="soft" size="sm" onClick={addQuestion} disabled={!newQuestion.trim()}>
              <Icon name="Plus" className="size-4" /> Add
            </Button>
          </div>
        </Card>

        {/* Actions */}
        <div className="no-print mt-5 space-y-2.5">
          <PrimaryButton onClick={() => window.print()}>
            <Icon name="Printer" className="size-5" />
            Print / save as PDF
          </PrimaryButton>
          <Button variant="outline" size="lg" className="w-full" onClick={() => downloadExport(new Date().toISOString())}>
            <Icon name="Download" className="size-5" />
            Export my data (JSON)
          </Button>
        </div>

        <HealthNotice className="no-print mt-6" compact>
          This summary reflects what you recorded. It is a conversation aid, not a diagnosis.
        </HealthNotice>
      </Screen>
    </>
  );
}
