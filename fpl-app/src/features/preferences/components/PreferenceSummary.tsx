import type { Team } from "@/features/fpl";
import {
  BUDGET_PHILOSOPHY_OPTIONS,
  DIFFERENTIAL_OPTIONS,
  PLANNING_HORIZON_OPTIONS,
  PLAYING_STYLE_OPTIONS,
  RECOMMENDATION_STYLE_OPTIONS,
  RISK_PROFILE_OPTIONS,
  ROTATION_TOLERANCE_OPTIONS,
  type PreferenceOption,
} from "../options";
import type { Preferences } from "../schema";

function labelOf<T>(options: PreferenceOption<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? String(value);
}

interface PreferenceSummaryProps {
  preferences: Preferences;
  teams: Team[];
}

/** A compact, read-only overview of a preference set. */
export function PreferenceSummary({
  preferences: p,
  teams,
}: PreferenceSummaryProps) {
  const club =
    p.favouriteClubId === null
      ? "None"
      : (teams.find((t) => t.id === p.favouriteClubId)?.name ??
        `Club ${p.favouriteClubId}`);

  const rows: { label: string; value: string }[] = [
    { label: "Favourite club", value: club },
    {
      label: "Recommendation style",
      value: labelOf(RECOMMENDATION_STYLE_OPTIONS, p.recommendationStyle),
    },
    { label: "Risk profile", value: labelOf(RISK_PROFILE_OPTIONS, p.riskProfile) },
    {
      label: "Differentials",
      value: labelOf(DIFFERENTIAL_OPTIONS, p.differentialPreference),
    },
    {
      label: "Planning horizon",
      value: labelOf(PLANNING_HORIZON_OPTIONS, p.planningHorizon),
    },
    {
      label: "Budget philosophy",
      value: labelOf(BUDGET_PHILOSOPHY_OPTIONS, p.budgetPhilosophy),
    },
    {
      label: "Form vs fixtures",
      value: `${Math.round(p.formBias * 100)}% form / ${
        100 - Math.round(p.formBias * 100)
      }% fixtures`,
    },
    {
      label: "Rotation tolerance",
      value: labelOf(ROTATION_TOLERANCE_OPTIONS, p.rotationTolerance),
    },
    {
      label: "Playing style",
      value: labelOf(PLAYING_STYLE_OPTIONS, p.playingStyle),
    },
  ];

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-4 border-b py-1.5 text-sm"
        >
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="text-right font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
