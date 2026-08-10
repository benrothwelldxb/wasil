import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { WellbeingSelector } from '@/components/product/WellbeingSelector';
import { SymptomRow } from '@/components/product/SymptomRow';
import { SeveritySelector } from '@/components/product/SeveritySelector';
import { ContextTagChip } from '@/components/product/ContextTagChip';
import { IconButton } from '@/components/common/IconButton';
import { IconBadge } from '@/components/common/IconBadge';
import { SelectableOption } from '@/components/common/SelectableOption';
import { usePinnedSymptoms } from '@/hooks/usePinnedSymptoms';
import { useCheckInDraft } from '@/store/checkInDraftStore';
import { CONTEXT_TAGS } from '@/data/catalog';

export function CheckInScreen() {
  const navigate = useNavigate();
  const draft = useCheckInDraft();

  const pinnedSymptoms = usePinnedSymptoms();

  const handleSave = () => {
    // Phase 0: no persistence. Reset the draft and return to Today.
    draft.reset();
    navigate('/today');
  };

  return (
    <>
      <ScreenHeader eyebrow="Daily check-in" title="How's today?" showBack />
      <Screen className="pb-40">
        <p className="mt-1 text-sm text-muted-foreground">
          A quick snapshot — only fill in what feels relevant.
        </p>

        <Step number={1} title="Overall wellbeing">
          <WellbeingSelector value={draft.wellbeing} onChange={draft.setWellbeing} />
        </Step>

        <Step number={2} title="Your symptoms" hint="Optional — skip any that don't apply">
          <Card className="divide-y divide-border/60 px-5 py-1">
            {pinnedSymptoms.map((symptom) => (
              <SymptomRow key={symptom.id} symptom={symptom}>
                <SeveritySelector
                  label={symptom.label}
                  value={draft.severities[symptom.id]}
                  onChange={(v) => draft.setSeverity(symptom.id, v)}
                />
              </SymptomRow>
            ))}
          </Card>
        </Step>

        <Step number={3} title="Anything change?" hint="Optional context">
          <div className="flex flex-wrap gap-2">
            {CONTEXT_TAGS.map((tag) => (
              <ContextTagChip
                key={tag.id}
                tag={tag}
                selected={draft.contextTagIds.includes(tag.id)}
                onToggle={draft.toggleContextTag}
              />
            ))}
          </div>
        </Step>

        <Step number={4} title="Add a note" hint="Optional">
          <Card className="p-3">
            <div className="flex items-start gap-2">
              <textarea
                value={draft.note}
                onChange={(e) => draft.setNote(e.target.value)}
                rows={3}
                placeholder="Anything you'd like to remember about today…"
                aria-label="Note about today"
                className="min-h-[72px] flex-1 resize-none bg-transparent p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
              />
              <IconButton
                icon="Mic"
                label="Voice note (coming soon)"
                variant="soft"
                disabled
                title="Voice entry coming in a later phase"
              />
            </div>
          </Card>
        </Step>

        {/* Special action */}
        <SelectableOption
          selected={draft.flaggedUnusual}
          onToggle={draft.toggleFlaggedUnusual}
          className="mt-6"
        >
          <span className="flex items-center gap-3">
            <IconBadge
              icon={draft.flaggedUnusual ? 'Check' : 'TriangleAlert'}
              size="md"
              tone={draft.flaggedUnusual ? 'attention' : 'muted'}
            />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">
                Today feels unusual
              </span>
              <span className="block text-xs text-muted-foreground">
                Flag this day so it stands out when you look back.
              </span>
            </span>
          </span>
        </SelectableOption>
      </Screen>

      {/* Sticky save bar */}
      <div className="pointer-events-none sticky bottom-0 z-10 -mt-24 bg-gradient-to-t from-background via-background to-transparent px-5 pb-4 pt-10">
        <div className="pointer-events-auto">
          <PrimaryButton onClick={handleSave}>Save check-in</PrimaryButton>
        </div>
      </div>
    </>
  );
}

function Step({
  number,
  title,
  hint,
  children,
}: {
  number: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {number}
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {hint ? <span className="text-xs text-muted-foreground">· {hint}</span> : null}
      </div>
      {children}
    </section>
  );
}
