import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { AppointmentSection } from '@/components/product/AppointmentSection';
import {
  useAppointmentSummary,
  useHowChanged,
  useAllSymptoms,
} from '@/hooks/queries';
import { shareService } from '@/services';
import { isLinkActive } from '@/services/sharing';
import { formatDateRange } from '@/lib/date';

/**
 * The recipient's read-only view of a share link. In this web build the link
 * resolves on-device; with the backend connected the same route renders from a
 * signed server payload. No editing, no navigation into the owner's app.
 */
export function SharedViewScreen() {
  const { token = '' } = useParams();
  const link = shareService.get(token);

  if (!link || !isLinkActive(link)) {
    return <Unavailable revoked={Boolean(link?.revokedAt)} />;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg bg-background px-5 py-8">
      <div className="mb-5 flex items-center gap-2">
        <span className="font-display text-xl font-semibold text-primary">elowa</span>
        <span className="text-sm text-muted-foreground">· shared with you</span>
      </div>
      {link.audience === 'clinician' ? <ClinicianView /> : <PartnerView note={link.partnerNote} visibleIds={shareService.visibleSymptomIds(link)} />}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        A read-only summary shared privately. It reflects what was recorded and isn’t a medical diagnosis.
      </p>
    </div>
  );
}

function Unavailable({ revoked }: { revoked: boolean }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
      <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon name="Lock" className="size-7" />
      </span>
      <p className="text-lg font-semibold text-foreground">This link is no longer available</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {revoked ? 'It was turned off by the person who shared it.' : 'It may have expired. Ask them to share a new one.'}
      </p>
    </div>
  );
}

function ClinicianView() {
  const { data: summary } = useAppointmentSummary();
  if (!summary || summary.checkInCount === 0) {
    return <Card className="p-5 text-sm text-muted-foreground">No summary is available yet.</Card>;
  }
  return (
    <Card className="p-5">
      <h1 className="mb-3 text-lg font-semibold text-foreground">Visit summary</h1>
      <AppointmentSection icon="Info" title="Context">
        <p className="text-sm text-muted-foreground">{summary.context}</p>
      </AppointmentSection>
      <AppointmentSection icon="CalendarDays" title="Overview">
        <p className="text-sm text-foreground">
          {formatDateRange(summary.rangeStart, summary.rangeEnd)} · {summary.checkInCount} check-ins across{' '}
          {summary.daysTracked} days.
        </p>
      </AppointmentSection>
      {summary.changes.length > 0 ? (
        <AppointmentSection icon="Activity" title="What changed">
          <ul className="space-y-1.5">
            {summary.changes.map((c) => (
              <li key={c.symptomId} className="text-sm text-foreground">{c.description}</li>
            ))}
          </ul>
        </AppointmentSection>
      ) : null}
      {summary.mostDisruptive.length > 0 ? (
        <AppointmentSection icon="LineChart" title="Most frequently disruptive">
          <ol className="list-inside list-decimal space-y-1 text-sm text-foreground">
            {summary.mostDisruptive.map((s) => (
              <li key={s.symptomId}>{s.label}</li>
            ))}
          </ol>
        </AppointmentSection>
      ) : null}
      <AppointmentSection icon="CalendarClock" title="Cycle changes">
        <p className="text-sm text-muted-foreground">{summary.cycleSummary}</p>
      </AppointmentSection>
      {summary.questions.length > 0 ? (
        <AppointmentSection icon="CircleHelp" title="Questions">
          <ul className="space-y-1 text-sm text-foreground">
            {summary.questions.map((q, i) => (
              <li key={i}>• {q}</li>
            ))}
          </ul>
        </AppointmentSection>
      ) : null}
    </Card>
  );
}

function PartnerView({ note, visibleIds }: { note?: string; visibleIds: string[] }) {
  const { data: summary } = useHowChanged();
  const { data: symptoms } = useAllSymptoms();
  const visibleLabels = new Set(
    visibleIds.map((id) => symptoms?.find((s) => s.id === id)?.label).filter(Boolean) as string[],
  );
  const lines = (summary?.lines ?? []).filter((l) => visibleLabels.size === 0 || visibleLabels.has(l.label));

  return (
    <Card className="p-5">
      <h1 className="mb-1 text-lg font-semibold text-foreground">How things are going</h1>
      <p className="mb-4 text-sm text-muted-foreground">A gentle snapshot to help you understand and support.</p>

      {note ? (
        <div className="mb-4 rounded-xl bg-primary-soft p-3">
          <p className="text-sm italic text-primary">“{note}”</p>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <ul className="space-y-2">
          {lines.slice(0, 5).map((l, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <Icon name="Heart" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Things have been fairly steady recently.</p>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Sensitive details are kept private and aren’t shown here.
      </p>
    </Card>
  );
}
