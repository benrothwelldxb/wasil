import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { SelectableOption } from '@/components/common/SelectableOption';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Wordmark } from '@/components/brand/Wordmark';
import { PrivacyNote } from '@/components/common/PrivacyNote';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useCompleteOnboarding } from '@/hooks/queries';
import { ONBOARDING_REASONS } from '@/domain/constants';
import { SYMPTOMS } from '@/data/catalog';
import { makeId } from '@/lib/id';
import { BRAND } from '@/config/brand';
import type { Symptom } from '@/domain/models';
import { cn } from '@/lib/utils';

type Stage = 'welcome' | 'reason' | 'symptoms';

const MIN_SYMPTOMS = 3;
const MAX_SYMPTOMS = 7;

export function OnboardingScreen() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('welcome');
  const { reasons, toggleReason, selectedSymptomIds, toggleSymptom, addSymptom } =
    useOnboardingStore();
  const [customSymptoms, setCustomSymptoms] = useState<Symptom[]>([]);
  const [customLabel, setCustomLabel] = useState('');
  const complete = useCompleteOnboarding();

  const allSymptoms = [...SYMPTOMS, ...customSymptoms];
  const count = selectedSymptomIds.length;
  const canFinish = count >= MIN_SYMPTOMS && count <= MAX_SYMPTOMS;

  const addCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    const symptom: Symptom = {
      id: makeId('sym_custom'),
      key: label.toLowerCase().replace(/\s+/g, '_'),
      label,
      category: 'other',
      icon: 'Sparkles',
      custom: true,
    };
    setCustomSymptoms((prev) => [...prev, symptom]);
    addSymptom(symptom.id);
    setCustomLabel('');
  };

  const finish = () => {
    complete.mutate(
      {
        reasons,
        pinnedIds: selectedSymptomIds,
        customSymptoms: customSymptoms.filter((c) => selectedSymptomIds.includes(c.id)),
      },
      { onSuccess: () => navigate('/today') },
    );
  };

  return (
    <Screen className="flex min-h-[100dvh] flex-col pb-8">
      {stage !== 'welcome' ? (
        <div className="flex items-center gap-2 pt-6">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            onClick={() => setStage(stage === 'symptoms' ? 'reason' : 'welcome')}
          >
            <Icon name="ChevronLeft" className="size-6" />
          </Button>
          <div className="flex flex-1 gap-1.5">
            <StepBar active />
            <StepBar active={stage === 'symptoms'} />
          </div>
        </div>
      ) : null}

      {stage === 'welcome' ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Wordmark size="lg" showTagline className="items-center" />
          <h1 className="mt-8 text-3xl font-semibold text-foreground">
            A calmer way to understand your change
          </h1>
          <p className="mt-3 max-w-xs text-muted-foreground">
            {BRAND.name} learns what’s usual for you, then helps you notice when things change —
            privately, at your own pace.
          </p>
          <div className="mt-10 w-full">
            <PrimaryButton onClick={() => setStage('reason')}>Get started</PrimaryButton>
          </div>
          <PrivacyNote className="mt-6" />
        </div>
      ) : null}

      {stage === 'reason' ? (
        <div className="flex flex-1 flex-col pt-8">
          <h1 className="text-2xl font-semibold text-foreground">
            What made you download {BRAND.name} today?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose any that apply — there are no wrong answers.
          </p>
          <div className="mt-6 space-y-2.5">
            {ONBOARDING_REASONS.map((r) => {
              const selected = reasons.includes(r.value);
              return (
                <SelectableOption key={r.value} selected={selected} onToggle={() => toggleReason(r.value)}>
                  <span className="flex flex-1 items-center justify-between gap-3 text-sm font-medium text-foreground">
                    {r.label}
                    {selected ? <Icon name="Check" className="size-5 text-primary" /> : null}
                  </span>
                </SelectableOption>
              );
            })}
          </div>
          <div className="mt-8">
            <PrimaryButton onClick={() => setStage('symptoms')}>Continue</PrimaryButton>
            <button
              type="button"
              onClick={() => setStage('symptoms')}
              className="mt-3 w-full text-center text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
          </div>
        </div>
      ) : null}

      {stage === 'symptoms' ? (
        <div className="flex flex-1 flex-col pt-8">
          <h1 className="text-2xl font-semibold text-foreground">
            What would you most like to keep an eye on?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose {MIN_SYMPTOMS}–{MAX_SYMPTOMS}. These become your daily check-in.
          </p>
          <p className="mt-1 text-xs font-medium text-primary" aria-live="polite">
            {count} selected{count > MAX_SYMPTOMS ? ` — please choose ${MAX_SYMPTOMS} or fewer` : ''}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {allSymptoms.map((symptom) => {
              const selected = selectedSymptomIds.includes(symptom.id);
              const disabled = !selected && count >= MAX_SYMPTOMS;
              return (
                <SelectableOption
                  key={symptom.id}
                  selected={selected}
                  onToggle={() => !disabled && toggleSymptom(symptom.id)}
                  icon={symptom.icon}
                  showCheckWhenSelected
                  className={cn('px-3', disabled && 'opacity-40')}
                >
                  <span className="text-sm font-medium text-foreground">{symptom.label}</span>
                </SelectableOption>
              );
            })}
          </div>

          {/* Custom symptom */}
          <div className="mt-4 flex items-center gap-2">
            <input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              placeholder="Add your own…"
              aria-label="Add a custom symptom"
              className="h-11 flex-1 rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button variant="soft" size="sm" onClick={addCustom} disabled={!customLabel.trim()}>
              <Icon name="Plus" className="size-4" /> Add
            </Button>
          </div>

          <div className="mt-8">
            <PrimaryButton disabled={!canFinish || complete.isPending} onClick={finish}>
              Start using {BRAND.name}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </Screen>
  );
}

function StepBar({ active = false }: { active?: boolean }) {
  return (
    <span
      className={cn('h-1.5 flex-1 rounded-full', active ? 'bg-primary' : 'bg-muted')}
      aria-hidden="true"
    />
  );
}
