import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAppointments, useSaveAppointment, useDeleteAppointment } from '@/hooks/queries';
import { formatDayMonth, todayIso, type IsoDate } from '@/lib/date';
import type { AppointmentRecord } from '@/domain/models';

type Draft = {
  id?: string;
  date: IsoDate;
  clinicianName: string;
  specialty: string;
  reason: string;
  questions: string[];
  outcomes: string[];
  followUpDate: string;
  notes: string;
};

function toDraft(a?: AppointmentRecord): Draft {
  return {
    ...(a?.id ? { id: a.id } : {}),
    date: a?.date ?? todayIso(),
    clinicianName: a?.clinicianName ?? '',
    specialty: a?.specialty ?? '',
    reason: a?.reason ?? '',
    questions: a?.questions ?? [],
    outcomes: a?.outcomes ?? [],
    followUpDate: a?.followUpDate ?? '',
    notes: a?.notes ?? '',
  };
}

export function AppointmentsScreen() {
  const navigate = useNavigate();
  const { data: appointments } = useAppointments();
  const save = useSaveAppointment();
  const remove = useDeleteAppointment();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const today = todayIso();
  const upcoming = (appointments ?? []).filter((a) => a.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = (appointments ?? []).filter((a) => a.date < today);

  if (editing) {
    return (
      <AppointmentEditor
        draft={editing}
        onChange={setEditing}
        onSave={() => {
          save.mutate({
            ...(editing.id ? { id: editing.id } : {}),
            date: editing.date,
            clinicianName: editing.clinicianName.trim() || undefined,
            specialty: editing.specialty.trim() || undefined,
            reason: editing.reason.trim() || undefined,
            notes: editing.notes.trim() || undefined,
            followUpDate: editing.followUpDate || undefined,
            questions: editing.questions.filter((q) => q.trim()),
            outcomes: editing.outcomes.filter((o) => o.trim()),
          });
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <>
      <ScreenHeader
        eyebrow="Appointments"
        title="Your visits"
        showBack
        trailing={
          <button
            type="button"
            aria-label="Add appointment"
            onClick={() => setEditing(toDraft())}
            className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary hover:bg-primary-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="Plus" className="size-5" />
          </button>
        }
      />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep appointments, the questions you want to ask, and what changed afterwards — all in one place.
        </p>

        <Button variant="soft" size="sm" className="mt-4" onClick={() => navigate('/appointment')}>
          <Icon name="FileText" className="size-4" />
          Prepare a summary to bring
        </Button>

        {(appointments ?? []).length === 0 ? (
          <EmptyState
            className="mt-6"
            icon="Stethoscope"
            title="No appointments yet"
            description="Add your next visit to prepare questions and record what you discuss."
          />
        ) : (
          <>
            {upcoming.length > 0 ? (
              <div className="mt-6">
                <SectionHeading>Coming up</SectionHeading>
                <div className="space-y-3">
                  {upcoming.map((a) => (
                    <AppointmentCard key={a.id} appointment={a} onEdit={() => setEditing(toDraft(a))} onDelete={() => setConfirmDelete(a.id)} />
                  ))}
                </div>
              </div>
            ) : null}

            {past.length > 0 ? (
              <div className="mt-6">
                <SectionHeading>Past visits</SectionHeading>
                <div className="space-y-3">
                  {past.map((a) => (
                    <AppointmentCard key={a.id} appointment={a} past onEdit={() => setEditing(toDraft(a))} onDelete={() => setConfirmDelete(a.id)} />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Screen>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Remove this appointment?"
        description="This removes the appointment and its questions and notes. Your check-ins are not affected."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </>
  );
}

function AppointmentCard({
  appointment,
  past = false,
  onEdit,
  onDelete,
}: {
  appointment: AppointmentRecord;
  past?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="Stethoscope" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {appointment.clinicianName || appointment.specialty || 'Appointment'}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDayMonth(appointment.date)}
            {appointment.specialty && appointment.clinicianName ? ` · ${appointment.specialty}` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          <button type="button" aria-label="Edit" onClick={onEdit} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
            <Icon name="Pencil" className="size-4" />
          </button>
          <button type="button" aria-label="Remove" onClick={onDelete} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
            <Icon name="Trash2" className="size-4" />
          </button>
        </div>
      </div>

      {appointment.questions.length > 0 ? (
        <div className="mt-3 rounded-xl bg-muted/50 p-3">
          <p className="mb-1 text-xs font-semibold text-foreground">Questions to ask</p>
          <ul className="space-y-1">
            {appointment.questions.map((q, i) => (
              <li key={i} className="text-xs text-muted-foreground">• {q}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {past ? (
        appointment.outcomes && appointment.outcomes.length > 0 ? (
          <div className="mt-2 rounded-xl bg-success/10 p-3">
            <p className="mb-1 text-xs font-semibold text-foreground">What changed after</p>
            <ul className="space-y-1">
              {appointment.outcomes.map((o, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {o}</li>
              ))}
            </ul>
            {appointment.followUpDate ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Follow-up: {formatDayMonth(appointment.followUpDate)}</p>
            ) : null}
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="mt-2" onClick={onEdit}>
            <Icon name="Plus" className="size-4" /> Record what changed
          </Button>
        )
      ) : null}
    </Card>
  );
}

function AppointmentEditor({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isPast = draft.date < todayIso();
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setListItem = (key: 'questions' | 'outcomes', i: number, value: string) =>
    set({ [key]: draft[key].map((v, idx) => (idx === i ? value : v)) } as Partial<Draft>);
  const addListItem = (key: 'questions' | 'outcomes') => set({ [key]: [...draft[key], ''] } as Partial<Draft>);

  return (
    <>
      <ScreenHeader eyebrow="Appointment" title={draft.id ? 'Edit appointment' : 'New appointment'} showBack onBack={onCancel} />
      <Screen>
        <Card className="mt-1 space-y-3 p-4">
          <Field label="Date">
            <input
              type="date"
              value={draft.date}
              onChange={(e) => set({ date: e.target.value })}
              className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <Field label="Clinician (optional)">
            <input type="text" value={draft.clinicianName} onChange={(e) => set({ clinicianName: e.target.value })} placeholder="e.g. Dr Rivera" className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Field>
          <Field label="Specialty / clinic (optional)">
            <input type="text" value={draft.specialty} onChange={(e) => set({ specialty: e.target.value })} placeholder="e.g. Menopause clinic" className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Field>
          <Field label="Reason (optional)">
            <input type="text" value={draft.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="What you'd like to talk about" className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Field>
        </Card>

        <div className="mt-5">
          <SectionHeading action={<button type="button" onClick={() => addListItem('questions')} className="text-primary">Add</button>}>
            Questions to ask
          </SectionHeading>
          <Card className="space-y-2 p-4">
            {draft.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Jot down anything you want to remember to ask.</p>
            ) : (
              draft.questions.map((q, i) => (
                <input
                  key={i}
                  type="text"
                  value={q}
                  onChange={(e) => setListItem('questions', i, e.target.value)}
                  placeholder="Your question"
                  className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              ))
            )}
          </Card>
        </div>

        {isPast ? (
          <div className="mt-5">
            <SectionHeading action={<button type="button" onClick={() => addListItem('outcomes')} className="text-primary">Add</button>}>
              What changed after
            </SectionHeading>
            <Card className="space-y-2 p-4">
              {draft.outcomes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Record any changes agreed — a new treatment, a dose change, or advice to follow.
                </p>
              ) : (
                draft.outcomes.map((o, i) => (
                  <input
                    key={i}
                    type="text"
                    value={o}
                    onChange={(e) => setListItem('outcomes', i, e.target.value)}
                    placeholder="e.g. Increased HRT dose"
                    className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ))
              )}
              <Field label="Follow-up date (optional)">
                <input type="date" value={draft.followUpDate} onChange={(e) => set({ followUpDate: e.target.value })} className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </Field>
            </Card>
          </div>
        ) : null}

        <div className="mt-6 flex gap-2">
          <Button className="flex-1" onClick={onSave}>Save</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </Screen>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
