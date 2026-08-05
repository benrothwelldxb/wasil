import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Rocket,
  Scale,
  Shield,
  Sparkles,
} from "lucide-react";
import { fetchManagerTeam, useTeams } from "@/features/fpl";
import { useImportFlash, useManagerStore } from "@/features/manager";
import { useSquadStore } from "@/features/squad-builder";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/paths";
import { NEUTRAL_PREFERENCES } from "../profiles";
import { usePreferenceStore } from "../preferenceStore";
import type { Preferences } from "../schema";
import { SegmentedField } from "./SegmentedField";
import { FavouriteClubField } from "./fields";

type Approach = "safe" | "balanced" | "big";
type Loyalty = "none" | "little" | "lots";
type Focus = "attack" | "balanced" | "defence";

interface Draft {
  name: string;
  managerId: number | null;
  favouriteClubId: number | null;
  approach: Approach;
  focus: Focus;
  loyalty: Loyalty;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  managerId: null,
  favouriteClubId: null,
  approach: "balanced",
  focus: "balanced",
  loyalty: "little",
};

const FOCUS_OPTIONS = [
  {
    value: "attack" as const,
    label: "Attackers",
    description: "Load up on goals and assists up top.",
  },
  {
    value: "balanced" as const,
    label: "Balanced",
    description: "Spread evenly across the pitch.",
  },
  {
    value: "defence" as const,
    label: "Defence",
    description: "Invest in clean sheets at the back.",
  },
];

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

  // Explicit focus wins over any style implied by the approach.
  prefs.playingStyle = draft.focus;

  return prefs;
}

/**
 * First-run onboarding overlay. Explains the 3-minute path and collects the
 * essentials (name, optional real-team import, club, approach, club loyalty) in
 * plain language, then builds a profile and drops the user on their team.
 * Self-gates on `onboardingComplete`.
 */
export function OnboardingModal() {
  const onboardingComplete = usePreferenceStore((s) => s.onboardingComplete);
  const applyOnboarding = usePreferenceStore((s) => s.applyOnboarding);
  const setOnboardingComplete = usePreferenceStore(
    (s) => s.setOnboardingComplete,
  );
  const { data: teams } = useTeams();
  const setDisplayName = useManagerStore((s) => s.setDisplayName);
  const connect = useManagerStore((s) => s.connect);
  const flagImported = useImportFlash((s) => s.flagImported);
  const setPlayers = useSquadStore((s) => s.setPlayers);
  const navigate = useNavigate();

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [index, setIndex] = useState(0);
  const [idInput, setIdInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedTeam, setImportedTeam] = useState<string | null>(null);

  // Steps are dynamic: the club-loyalty step only appears if a club is chosen.
  const steps = useMemo<string[]>(
    () => [
      "welcome",
      "you",
      "club",
      "approach",
      "focus",
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
      setDraft(EMPTY_DRAFT);
      setIdInput("");
      setImportError(null);
      setImportedTeam(null);
    }
  }, [onboardingComplete]);

  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));

  const skip = () => setOnboardingComplete(true);

  const importTeam = async () => {
    const id = Number(idInput.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setImportError("Enter your numeric Manager ID (digits only).");
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const team = await fetchManagerTeam(id);
      setPlayers(team.playerIds);
      connect(team.entryId, team.managerName, team.teamName);
      flagImported();
      track("team_imported", { source: "onboarding" });
      setImportedTeam(team.teamName);
      setDraft((d) => ({
        ...d,
        managerId: team.entryId,
        // Pre-fill the name from their account if they haven't typed one.
        name: d.name || team.managerName.split(/\s+/)[0] || "",
      }));
    } catch (err) {
      setImportError(
        err instanceof Error && err.message.includes("saved team")
          ? err.message
          : "Couldn't find that team. Double-check your Manager ID.",
      );
    } finally {
      setImporting(false);
    }
  };

  const finish = () => {
    if (draft.name.trim()) setDisplayName(draft.name);
    applyOnboarding("My Team", toPreferences(draft));
    track("onboarding_complete", { imported: draft.managerId !== null });
    navigate(ROUTES.dashboard);
  };

  const clubName =
    draft.favouriteClubId !== null
      ? (teams?.find((t) => t.id === draft.favouriteClubId)?.name ?? "your club")
      : "your club";

  return (
    <Dialog
      open={!onboardingComplete}
      onOpenChange={(o) => {
        if (!o) skip();
      }}
    >
      <DialogContent
        bare
        hideClose
        className="flex max-h-[92dvh] max-w-lg flex-col overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Set up MyFPLScout</DialogTitle>
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

          {step === "you" && (
            <div className="space-y-5">
              <div>
                <h2 id="onboarding-title" className="text-xl font-bold">
                  Already play FPL?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect your real team and we'll instantly show how it stacks
                  up against the optimal squad — plus your captain, chips, and
                  transfers, all personalised.
                </p>
              </div>

              {/* Primary action: connect your team. */}
              <div className="rounded-xl border bg-muted/40 p-3">
                {importedTeam ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--brand-green))]">
                    <CheckCircle2 className="h-4 w-4" />
                    Loaded {importedTeam} — your real team's in.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="ob-id" className="text-sm font-semibold">
                      Connect your team
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="ob-id"
                        value={idInput}
                        onChange={(e) => setIdInput(e.target.value)}
                        inputMode="numeric"
                        placeholder="Manager ID, e.g. 1234567"
                        aria-label="FPL Manager ID"
                      />
                      <Button
                        type="button"
                        onClick={importTeam}
                        disabled={importing || idInput.trim() === ""}
                      >
                        {importing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Import"
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      On the FPL website, open <strong>Points</strong> — the
                      number after{" "}
                      <code className="rounded bg-muted px-1">/entry/</code> in
                      the address bar is your ID. (Works once GW1 is underway.)
                    </p>
                    {importError && (
                      <p className="text-sm text-destructive">{importError}</p>
                    )}
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-muted-foreground">
                No worries if not — tap <strong>Next</strong> and we'll build you
                a team instead.
              </p>

              <div className="space-y-1.5 border-t pt-4">
                <label htmlFor="ob-name" className="text-sm font-medium">
                  What should we call you?
                </label>
                <Input
                  id="ob-name"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="Your name (optional)"
                  maxLength={40}
                  autoComplete="given-name"
                />
              </div>
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

          {step === "focus" && (
            <div className="space-y-4">
              <h2 id="onboarding-title" className="text-xl font-bold">
                Where do you want your firepower?
              </h2>
              <p className="text-sm text-muted-foreground">
                This shapes where your budget goes — more money up top, evenly
                spread, or stacked at the back.
              </p>
              <SegmentedField
                options={FOCUS_OPTIONS}
                value={draft.focus}
                onChange={(focus) => setDraft((d) => ({ ...d, focus }))}
                columns={3}
                ariaLabel="Team focus"
              />
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
      </DialogContent>
    </Dialog>
  );
}
