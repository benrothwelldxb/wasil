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
import { ONBOARDING_REASONS } from '@/domain/constants';
import { SYMPTOMS } from '@/data/catalog';
import { BRAND } from '@/config/brand';
import { cn } from '@/lib/utils';

type Stage = 'welcome' | 'reason' | 'symptoms';

export function OnboardingScreen() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('welcome');
  const { reason, setReason, selectedSymptomIds, toggleSymptom, complete } = useOnboardingStore();

  const finish = () => {
    complete();
    navigate('/today');
  };

  return (
    <Screen className="flex min-h-[100dvh] flex-col pb-8">
      {/* Progress */}
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
          <Wordmark className="scale-125" showTagline />
          <h1 className="mt-8 text-3xl font-semibold text-foreground">
            A calmer way to understand your change
          </h1>
          <p className="mt-3 max-w-xs text-muted-foreground">
            {BRAND.name} helps you notice patterns in how you feel — privately, and at your own
            pace.
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
            What made you download this today?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            There are no wrong answers — this just helps us start in the right place.
          </p>
          <div className="mt-6 space-y-2.5">
            {ONBOARDING_REASONS.map((r) => {
              const selected = reason === r.value;
              return (
                <SelectableOption
                  key={r.value}
                  selected={selected}
                  onToggle={() => setReason(r.value)}
                >
                  <span className="flex flex-1 items-center justify-between gap-3 text-sm font-medium text-foreground">
                    {r.label}
                    {selected ? <Icon name="Check" className="size-5 text-primary" /> : null}
                  </span>
                </SelectableOption>
              );
            })}
          </div>
          <div className="mt-8">
            <PrimaryButton disabled={!reason} onClick={() => setStage('symptoms')}>
              Continue
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      {stage === 'symptoms' ? (
        <div className="flex flex-1 flex-col pt-8">
          <h1 className="text-2xl font-semibold text-foreground">
            What would you like to keep an eye on?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose the symptoms you most want to track. These become your daily check-in.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2.5">
            {SYMPTOMS.map((symptom) => {
              const selected = selectedSymptomIds.includes(symptom.id);
              return (
                <SelectableOption
                  key={symptom.id}
                  selected={selected}
                  onToggle={() => toggleSymptom(symptom.id)}
                  icon={symptom.icon}
                  showCheckWhenSelected
                  className="px-3"
                >
                  <span className="text-sm font-medium text-foreground">{symptom.label}</span>
                </SelectableOption>
              );
            })}
          </div>
          <div className="mt-8">
            <PrimaryButton disabled={selectedSymptomIds.length === 0} onClick={finish}>
              Start using {BRAND.name}
            </PrimaryButton>
            <button
              type="button"
              onClick={finish}
              className="mt-3 w-full text-center text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Skip for now
            </button>
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
