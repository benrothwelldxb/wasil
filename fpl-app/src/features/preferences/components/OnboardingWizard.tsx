import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useTeams } from "@/features/fpl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePreferenceStore } from "../preferenceStore";
import { BUILT_IN_PROFILES, NEUTRAL_PREFERENCES } from "../profiles";
import type { Preferences } from "../schema";
import {
  PreferenceControls,
  type PreferenceSectionKey,
} from "./PreferenceControls";
import { PreferenceSummary } from "./PreferenceSummary";

interface Step {
  title: string;
  subtitle: string;
  sections?: PreferenceSectionKey[];
  kind?: "seed" | "review";
}

const STEPS: Step[] = [
  {
    title: "Choose a starting point",
    subtitle: "Pick a profile to tweak, or start from a clean slate.",
    kind: "seed",
  },
  {
    title: "Club & style",
    subtitle: "Your club is only ever an optional weighting.",
    sections: ["club", "style"],
  },
  {
    title: "Risk & differentials",
    subtitle: "How much variance are you comfortable with?",
    sections: ["risk", "differential"],
  },
  {
    title: "Horizon & budget",
    subtitle: "How far ahead should we plan, and how should we spend?",
    sections: ["horizon", "budget"],
  },
  {
    title: "Playing preferences",
    subtitle: "Form, rotation, and the style you enjoy.",
    sections: ["form", "rotation", "playing"],
  },
  {
    title: "Review & save",
    subtitle: "Name your profile — you can change everything later.",
    kind: "review",
  },
];

interface OnboardingWizardProps {
  /** Called after the profile is created. */
  onComplete: () => void;
  /** Optional skip handler (marks onboarding complete without a new profile). */
  onSkip?: () => void;
}

/** A guided, multi-step flow for configuring preferences the first time. */
export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const { data: teams } = useTeams();
  const createProfile = usePreferenceStore((s) => s.createProfile);
  const setOnboardingComplete = usePreferenceStore(
    (s) => s.setOnboardingComplete,
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Preferences>(NEUTRAL_PREFERENCES);
  const [seedId, setSeedId] = useState<string | null>(null);
  const [name, setName] = useState("My Profile");

  const step = STEPS[stepIndex]!;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const patch = (p: Partial<Preferences>) =>
    setDraft((prev) => ({ ...prev, ...p }));

  const finish = () => {
    createProfile(name, draft);
    setOnboardingComplete(true);
    onComplete();
  };

  const skip = () => {
    setOnboardingComplete(true);
    onSkip?.();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= stepIndex ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight">{step.title}</h2>
        <p className="text-sm text-muted-foreground">{step.subtitle}</p>
      </div>

      <div className="rounded-lg border bg-card p-5 shadow-sm">
        {step.kind === "seed" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setSeedId(null);
                setDraft(NEUTRAL_PREFERENCES);
              }}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                seedId === null
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-accent/40",
              )}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4" />
                Start from scratch
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Neutral, zero-bias defaults.
              </p>
            </button>
            {BUILT_IN_PROFILES.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  setSeedId(profile.id);
                  setDraft({ ...profile.preferences });
                }}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  seedId === profile.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-accent/40",
                )}
              >
                <div className="text-sm font-semibold">{profile.name}</div>
              </button>
            ))}
          </div>
        )}

        {step.sections && (
          <PreferenceControls
            value={draft}
            onChange={patch}
            teams={teams ?? []}
            sections={step.sections}
          />
        )}

        {step.kind === "review" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="profile-name"
                className="text-xs font-medium text-muted-foreground"
              >
                Profile name
              </label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="sm:max-w-xs"
              />
            </div>
            <PreferenceSummary preferences={draft} teams={teams ?? []} />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div>
          {onSkip && (
            <Button variant="ghost" size="sm" onClick={skip}>
              Skip for now
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <Button
              variant="outline"
              onClick={() => setStepIndex((i) => i - 1)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          {isLast ? (
            <Button onClick={finish} disabled={!name.trim()}>
              <Check className="h-4 w-4" />
              Save profile
            </Button>
          ) : (
            <Button onClick={() => setStepIndex((i) => i + 1)}>
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
