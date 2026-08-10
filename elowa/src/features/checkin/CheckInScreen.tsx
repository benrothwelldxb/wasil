import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/common/IconButton';
import { IconBadge } from '@/components/common/IconBadge';
import { RelativeStatusSelector } from '@/components/product/RelativeStatusSelector';
import { SeveritySelector } from '@/components/product/SeveritySelector';
import { ContextTagChip } from '@/components/product/ContextTagChip';
import { SelectableOption } from '@/components/common/SelectableOption';
import { Icon } from '@/components/ui/icon';
import { usePinnedSymptoms } from '@/hooks/usePinnedSymptoms';
import { useAllSymptoms, useCheckInByDate, useSaveCheckIn } from '@/hooks/queries';
import { useCheckInDraft } from '@/store/checkInDraftStore';
import { buildDetailedCheckIn } from './buildCheckIn';
import { CONTEXT_TAGS } from '@/data/catalog';
import type { ContextTagGroup, Symptom } from '@/domain/models';
import { todayIso } from '@/lib/date';

const GROUP_LABELS: Record<ContextTagGroup, string> = {
  life: 'Life',
  lifestyle: 'Lifestyle',
  health: 'Health',
};

export function CheckInScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const targetDate = params.get('date') || todayIso();
  const pinned = usePinnedSymptoms();
  const { data: allSymptoms } = useAllSymptoms();
  const existingQuery = useCheckInByDate(targetDate);
  const existing = existingQuery.data;
  const save = useSaveCheckIn();
  const draft = useCheckInDraft();

  const [extraIds, setExtraIds] = useState<string[]>([]);
  // Seed the draft from an existing entry when editing (once, after load).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || existingQuery.isLoading) return;
    seeded.current = true;
    draft.reset();
    if (!existing) return;
    for (const o of existing.observations) {
      if (o.status) draft.setStatus(o.symptomId, o.status);
      if (o.severity) draft.setSeverity(o.symptomId, o.severity);
    }
    for (const t of existing.contextTagIds) draft.toggleContextTag(t);
    if (existing.note) draft.setNote(existing.note);
    setExtraIds(existing.observations.map((o) => o.symptomId));
  }, [existing, existingQuery.isLoading, draft]);

  const [showAdd, setShowAdd] = useState(false);
  const [showSeverity, setShowSeverity] = useState<Record<string, boolean>>({});

  const shownSymptoms = useMemo(() => {
    const extra = (allSymptoms ?? []).filter((s) => extraIds.includes(s.id));
    return [...pinned, ...extra];
  }, [pinned, allSymptoms, extraIds]);

  const addable = (allSymptoms ?? []).filter(
    (s) => !pinned.some((p) => p.id === s.id) && !extraIds.includes(s.id),
  );

  const hasAny = Object.values(draft.observations).some((o) => o.status || o.severity);

  const handleSave = () => {
    const checkIn = buildDetailedCheckIn(targetDate, draft.observations, draft.contextTagIds, draft.note);
    save.mutate(checkIn, {
      onSuccess: () => {
        draft.reset();
        navigate(targetDate === todayIso() ? '/today' : '/calendar');
      },
    });
  };

  const tagsByGroup = (group: ContextTagGroup) => CONTEXT_TAGS.filter((t) => t.group === group);

  return (
    <>
      <ScreenHeader eyebrow="Check-in" title="What’s different today?" showBack />
      <Screen className="pb-40">
        <p className="mt-1 text-sm text-muted-foreground">
          {existing ? 'Updating today’s check-in.' : 'Only note what feels different from your usual.'}
        </p>

        {/* Symptoms */}
        <div className="mt-6 space-y-3">
          {shownSymptoms.map((symptom) => (
            <SymptomBlock
              key={symptom.id}
              symptom={symptom}
              status={draft.observations[symptom.id]?.status}
              severity={draft.observations[symptom.id]?.severity}
              showSeverity={Boolean(showSeverity[symptom.id])}
              onToggleSeverity={() =>
                setShowSeverity((prev) => ({ ...prev, [symptom.id]: !prev[symptom.id] }))
              }
              onStatus={(v) => draft.setStatus(symptom.id, v)}
              onSeverity={(v) => draft.setSeverity(symptom.id, v)}
            />
          ))}
        </div>

        {/* Add another symptom */}
        {addable.length > 0 ? (
          <div className="mt-3">
            {showAdd ? (
              <Card className="p-4">
                <p className="mb-2 text-sm font-semibold text-foreground">Add a symptom</p>
                <div className="grid grid-cols-2 gap-2">
                  {addable.map((s) => (
                    <SelectableOption
                      key={s.id}
                      selected={false}
                      onToggle={() => {
                        setExtraIds((prev) => [...prev, s.id]);
                        setShowAdd(false);
                      }}
                      icon={s.icon}
                      className="px-3"
                    >
                      <span className="text-sm font-medium text-foreground">{s.label}</span>
                    </SelectableOption>
                  ))}
                </div>
              </Card>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
                <Icon name="Plus" className="size-4" /> Add another symptom
              </Button>
            )}
          </div>
        ) : null}

        {/* Context */}
        <div className="mt-8">
          <h2 className="text-base font-semibold text-foreground">Anything change?</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Optional context.</p>
          {(['life', 'lifestyle', 'health'] as ContextTagGroup[]).map((group) => (
            <div key={group} className="mt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {GROUP_LABELS[group]}
              </p>
              <div className="flex flex-wrap gap-2">
                {tagsByGroup(group).map((tag) => (
                  <ContextTagChip
                    key={tag.id}
                    tag={tag}
                    selected={draft.contextTagIds.includes(tag.id)}
                    onToggle={draft.toggleContextTag}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Note */}
        <div className="mt-8">
          <h2 className="text-base font-semibold text-foreground">Add a note</h2>
          <Card className="mt-2 p-3">
            <div className="flex items-start gap-2">
              <textarea
                value={draft.note}
                onChange={(e) => draft.setNote(e.target.value)}
                rows={3}
                placeholder="Anything else worth remembering?"
                aria-label="Note about today"
                className="min-h-[72px] flex-1 resize-none bg-transparent p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
              />
              <IconButton
                icon="Mic"
                label="Voice note (coming soon)"
                variant="soft"
                disabled
                title="Voice entry is coming in a later phase"
              />
            </div>
          </Card>
        </div>
      </Screen>

      {/* Sticky save bar */}
      <div className="pointer-events-none sticky bottom-0 z-10 -mt-24 bg-gradient-to-t from-background via-background to-transparent px-5 pb-4 pt-10">
        <div className="pointer-events-auto">
          <PrimaryButton onClick={handleSave} disabled={!hasAny || save.isPending}>
            Save check-in
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}

function SymptomBlock({
  symptom,
  status,
  severity,
  showSeverity,
  onToggleSeverity,
  onStatus,
  onSeverity,
}: {
  symptom: Symptom;
  status: import('@/domain/models').RelativeStatus | undefined;
  severity: import('@/domain/models').Severity | undefined;
  showSeverity: boolean;
  onToggleSeverity: () => void;
  onStatus: (v: import('@/domain/models').RelativeStatus) => void;
  onSeverity: (v: import('@/domain/models').Severity) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <IconBadge icon={symptom.icon} size="md" tone="brand" />
        <p className="flex-1 text-sm font-semibold text-foreground">{symptom.label}</p>
      </div>
      <RelativeStatusSelector value={status} onChange={onStatus} label={symptom.label} className="mt-3" />
      <button
        type="button"
        onClick={onToggleSeverity}
        className="mt-2 text-xs font-medium text-primary hover:underline"
      >
        {showSeverity ? 'Hide level' : 'Add a level (optional)'}
      </button>
      {showSeverity ? (
        <SeveritySelector value={severity} onChange={onSeverity} label={symptom.label} className="mt-2" />
      ) : null}
    </Card>
  );
}
