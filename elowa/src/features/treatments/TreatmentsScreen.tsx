import { useState } from 'react';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { HealthNotice } from '@/components/common/HealthNotice';
import { EmptyState } from '@/components/common/EmptyState';
import { Icon } from '@/components/ui/icon';
import { TreatmentTimeline } from '@/components/product/TreatmentTimeline';
import { useTreatments, useUpsertTreatment, useRemoveTreatment } from '@/hooks/queries';
import { TREATMENT_CATEGORY_META, TREATMENT_CATEGORY_ORDER } from '@/domain/constants';
import type { TreatmentCategory, TreatmentEvent } from '@/domain/models';
import { todayIso } from '@/lib/date';
import { makeId } from '@/lib/id';
import { cn } from '@/lib/utils';

const EMPTY: TreatmentEvent = { id: '', category: 'hrt', title: '', date: todayIso() };

export function TreatmentsScreen() {
  const { data: treatments } = useTreatments();
  const upsert = useUpsertTreatment();
  const remove = useRemoveTreatment();
  const [editing, setEditing] = useState<TreatmentEvent | null>(null);

  return (
    <>
      <ScreenHeader eyebrow="What you're taking or trying" title="Treatments" showBack />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          Record HRT, medication, supplements or lifestyle changes. These appear alongside your
          symptom patterns.
        </p>

        {editing ? (
          <TreatmentForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(event) => {
              upsert.mutate(event, { onSuccess: () => setEditing(null) });
            }}
            onDelete={
              editing.id
                ? () => {
                    remove.mutate(editing.id);
                    setEditing(null);
                  }
                : undefined
            }
          />
        ) : (
          <>
            <Button
              variant="soft"
              className="mt-4 w-full"
              onClick={() => setEditing({ ...EMPTY, id: '', date: todayIso() })}
            >
              <Icon name="Plus" className="size-5" /> Add a treatment
            </Button>

            {treatments && treatments.length > 0 ? (
              <Card className="mt-5 p-5">
                <TreatmentTimeline events={treatments} onSelect={(e) => setEditing(e)} />
              </Card>
            ) : (
              <EmptyState
                className="mt-5"
                icon="Pill"
                title="No treatments recorded"
                description="Add HRT, a medication, a supplement or a lifestyle change to see it on your timeline."
              />
            )}
          </>
        )}

        <HealthNotice className="mt-6" compact>
          elowa records what you report. It does not recommend starting, stopping or changing any
          medication or HRT — please discuss those decisions with a healthcare professional.
        </HealthNotice>
      </Screen>
    </>
  );
}

function TreatmentForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: TreatmentEvent;
  onSave: (event: TreatmentEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<TreatmentEvent>(initial);
  const set = <K extends keyof TreatmentEvent>(key: K, value: TreatmentEvent[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    if (!form.title.trim()) return;
    onSave({
      ...form,
      id: form.id || makeId('trt'),
      title: form.title.trim(),
    });
  };

  const field = 'h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const showDose = form.category === 'hrt' || form.category === 'medication';

  return (
    <Card className="mt-4 p-5">
      <p className="text-base font-semibold text-foreground">
        {form.id ? 'Edit treatment' : 'Add treatment'}
      </p>

      <p className="mt-3 text-xs font-medium text-muted-foreground">Type</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {TREATMENT_CATEGORY_ORDER.map((cat) => (
          <CategoryChip key={cat} cat={cat} selected={form.category === cat} onSelect={() => set('category', cat)} />
        ))}
      </div>

      <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor="trt-title">
        Name
      </label>
      <input
        id="trt-title"
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="e.g. Estradiol patch"
        className={cn(field, 'mt-1')}
      />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="trt-date">
            Start date
          </label>
          <input id="trt-date" type="date" value={form.date} max={todayIso()} onChange={(e) => set('date', e.target.value)} className={cn(field, 'mt-1')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="trt-end">
            End date (optional)
          </label>
          <input
            id="trt-end"
            type="date"
            value={form.endDate ?? ''}
            onChange={(e) => set('endDate', e.target.value || undefined)}
            className={cn(field, 'mt-1')}
          />
        </div>
      </div>

      {showDose ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="trt-dose">
              Dose (optional)
            </label>
            <input id="trt-dose" value={form.dose ?? ''} onChange={(e) => set('dose', e.target.value || undefined)} placeholder="50mcg" className={cn(field, 'mt-1')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="trt-freq">
              Frequency (optional)
            </label>
            <input id="trt-freq" value={form.frequency ?? ''} onChange={(e) => set('frequency', e.target.value || undefined)} placeholder="twice weekly" className={cn(field, 'mt-1')} />
          </div>
        </div>
      ) : null}

      <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor="trt-note">
        Note (optional)
      </label>
      <textarea
        id="trt-note"
        value={form.note ?? ''}
        onChange={(e) => set('note', e.target.value || undefined)}
        rows={2}
        className="mt-1 w-full resize-none rounded-xl border border-input bg-card p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="mt-4 flex gap-2">
        <PrimaryButton onClick={save} disabled={!form.title.trim()}>
          Save
        </PrimaryButton>
        <Button variant="ghost" size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {onDelete ? (
        <Button variant="ghost" size="sm" className="mt-2 w-full text-attention hover:bg-attention/10" onClick={onDelete}>
          <Icon name="Trash2" className="size-4" /> Delete treatment
        </Button>
      ) : null}
    </Card>
  );
}

function CategoryChip({
  cat,
  selected,
  onSelect,
}: {
  cat: TreatmentCategory;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = TREATMENT_CATEGORY_META[cat];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted/60',
      )}
    >
      <Icon name={meta.icon} className="size-4" />
      {meta.label}
    </button>
  );
}
