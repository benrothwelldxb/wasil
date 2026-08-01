import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Rocket,
  Scale,
  Shield,
  Sparkles,
} from "lucide-react";
import { useTeams } from "@/features/fpl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/paths";
import { NEUTRAL_PREFERENCES } from "../profiles";
import { usePreferenceStore } from "../preferenceStore";
import type { Preferences } from "../schema";
import { SegmentedField } from "./SegmentedField";
import { FavouriteClubField } from "./fields";

type Approach = "safe" | "balanced" | "big";
type Loyalty = "none" | "little" | "lots";

interface Draft {
  favouriteClubId: number | null;
  approach: Approach;
  loyalty: Loyalty;
}

const APPROACH_OPTIONS = [
  {
    value: "safe" as const,
    label: "Safe & steady",
    description: "Reliable players who start every week. Fewer surprises.",
  },
  {
    value: "balanced" as const,
    label: "Balanced",
    description: "A solid core with a couple of bold picks.",
  },
  {
    value: "big" as const,
    label: "Go big",
    description: "Chase big hauls with bold picks. Bigger ups and downs.",
  },
];

const APPROACH_ICON: Record<Approach, typeof Shield> = {
  safe: Shield,
  balanced: Scale,
  big: Rocket,
};

/** Turn the 2–3 simple answers into a full preferences object. */
function toPreferences(draft: Draft): Preferences {
  const prefs: Preferences = {
    ...NEUTRAL_PREFERENCES,
    favouriteClubId: draft.favouriteClubId,
  };

  if (draft.approach === "safe") {
    prefs.riskProfile = "conservative";
    prefs.differentialPreference = "occasionally";
    prefs.rotationTolerance = "avoid";
    prefs.formBias = 0.55;
  } else if (draft.approach === "big") {
    prefs.riskProfile = "aggressive";
    prefs.differentialPreference = "prefer";
    prefs.rotationTolerance = "high-risk";
    prefs.playingStyle = "attack";
    prefs.budgetPhilosophy = "spend-every-penny";
    prefs.formBias = 0.45;
  }

  if (draft.favouriteClubId !== null) {
    prefs.recommendationStyle =
      draft.loyalty === "lots"
        ? "club-loyalist"
        : draft.loyalty === "little"
          ? "slight-affinity"
          : "pure-data";
  }

  return prefs;
}

/**
 * First-run onboarding overlay. Explains the 3-minute path and collects the
 * essentials (club, approach, club loyalty) in plain language, then builds a
 * profile and drops the user on their team. Self-gates on `onboardingComplete`.
 */
export function OnboardingModal() {
  const onboardingComplete = usePreferenceStore((s) => s.onboardingComplete);
  const createProfile = usePreferenceStore((s) => s.createProfile);
  const setOnboardingComplete = usePreferenceStore(
    (s) => s.setOnboardingComplete,
  );
  const { data: teams } = useTeams();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<Draft>({
    favouriteClubId: null,
    approach: "balanced",
    loyalty: "little",
  });
  const [index, setIndex] = useState(0);

  // Steps are dynamic: the club-loyalty step only appears if a club is chosen.
  const steps = useMemo<string[]>(
    () => [
      "welcome",
      "club",
      "approach",
      ...(draft.favouriteClubId !== null ? ["loyalty"] : []),
      "done",
    ],
    [draft.favouriteClubId],
  );
  const step = steps[Math.min(index, steps.length - 1)] ?? "welcome";

  // Start the flow from the top whenever it (re)opens — e.g. when replayed
  // from Settings — so a returning user doesn't land on the final step.
  useEffect(() => {
    if (!onboardingComplete) {
      setIndex(0);
      setDraft({
        favouriteClubId: null,
        approach: "balanced",
        loyalty: "little",
      });
    }
  }, [onboardingComplete]);

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    if (onboardingComplete) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [onboardingComplete]);

  if (onboardingComplete) return null;

  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));

  const skip = () => setOnboardingComplete(true);

  const finish = () => {
    createProfile("My Team", toPreferences(draft));
    setOnboardingComplete(true);
    navigate(ROUTES.dashboard);
  };

  const clubName =
    draft.favouriteClubId !== null
      ? (teams?.find((t) => t.id === draft.favouriteClubId)?.name ?? "your club")
      : "your club";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur animate-in fade-in"
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
        {/* Progress */}
        <div className="flex items-center gap-1.5 p-4 pb-0">
          {steps.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= index ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === "welcome" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 id="onboarding-title" className="text-2xl font-bold">
                Pick a great FPL team in 3 minutes
              </h2>
              <p className="text-muted-foreground">
                MyFPLScout does the hard maths for you. Answer a couple of quick
                questions and we'll build a full team — then you can tweak it,
                choose a captain, and plan transfers.
              </p>
            </div>
          )}

          {step === "club" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="text-xl font-bold">
                Which team do you support?
              </h2>
              <p className="text-sm text-muted-foreground">
                Optional. We'll give your club's players a small boost — but
                only when they're still a smart pick. It never forces a bad
                player into your team.
              </p>
              <FavouriteClubField
                teams={teams ?? []}
                value={draft.favouriteClubId}
                onChange={(favouriteClubId) =>
                  setDraft((d) => ({ ...d, favouriteClubId }))
                }
              />
            </div>
          )}

          {step === "approach" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="text-xl font-bold">
                How do you like to play?
              </h2>
              <p className="text-sm text-muted-foreground">
                There's no wrong answer — it just changes the kind of players we
                suggest.
              </p>
              <SegmentedField
                options={APPROACH_OPTIONS}
                value={draft.approach}
                onChange={(approach) => setDraft((d) => ({ ...d, approach }))}
                columns={3}
                ariaLabel="Your approach"
              />
              <div className="flex justify-center pt-1 text-muted-foreground">
                {(() => {
                  const Icon = APPROACH_ICON[draft.approach];
                  return <Icon className="h-8 w-8" aria-hidden />;
                })()}
              </div>
            </div>
          )}

          {step === "loyalty" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="text-xl font-bold">
                How much should we favour {clubName}?
              </h2>
              <p className="text-sm text-muted-foreground">
                We'll never pick a weak player just because they're at your club.
              </p>
              <SegmentedField
                options={[
                  {
                    value: "none",
                    label: "Just the best team",
                    description: "Ignore my club — best players only.",
                  },
                  {
                    value: "little",
                    label: "A little love",
                    description: "A small nudge toward my club.",
                  },
                  {
                    value: "lots",
                    label: "Load up",
                    description: "As many of my club as makes sense.",
                  },
                ]}
                value={draft.loyalty}
                onChange={(loyalty) =>
                  setDraft((d) => ({ ...d, loyalty: loyalty as Loyalty }))
                }
                columns={3}
                ariaLabel="Club loyalty"
              />
            </div>
          )}

          {step === "done" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15 text-success">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 id="onboarding-title" className="text-2xl font-bold">
                You're all set!
              </h2>
              <p className="text-muted-foreground">
                We'll build your team on the home screen. Tap{" "}
                <strong className="text-foreground">Pick Team</strong> any time
                for a fresh one, then{" "}
                <strong className="text-foreground">Use this team</strong> to
                save it and choose your captain.
              </p>
              <p className="text-xs text-muted-foreground">
                You can change all of this later in Preferences.
              </p>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between gap-2 border-t p-4">
          {index === 0 ? (
            <Button variant="ghost" size="sm" onClick={skip}>
              Skip
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={back}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}

          {step === "done" ? (
            <Button onClick={finish}>
              See my team
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={next}>
              {step === "welcome" ? "Let's go" : "Next"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
