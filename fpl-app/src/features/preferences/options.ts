import type {
  BudgetPhilosophy,
  DifferentialPreference,
  PlanningHorizon,
  PlayingStyle,
  RecommendationStyle,
  RiskProfile,
  RotationTolerance,
} from "./schema";

/** Generic option descriptor for choice-based preference controls. */
export interface PreferenceOption<T> {
  value: T;
  label: string;
  description: string;
}

export const RECOMMENDATION_STYLE_OPTIONS: PreferenceOption<RecommendationStyle>[] =
  [
    {
      value: "pure-data",
      label: "Pure Data",
      description: "Mathematically optimal with zero bias.",
    },
    {
      value: "slight-affinity",
      label: "Slight Affinity",
      description: "A small preference towards favourite-club players.",
    },
    {
      value: "club-loyalist",
      label: "Club Loyalist",
      description: "Moderate preference where projected points stay competitive.",
    },
    {
      value: "die-hard",
      label: "Die Hard Supporter",
      description: "Strong preference for your club, still obeying all rules.",
    },
  ];

export const RISK_PROFILE_OPTIONS: PreferenceOption<RiskProfile>[] = [
  {
    value: "conservative",
    label: "Conservative",
    description: "Reliable minutes, consistency, and a high floor.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "A measured mix of floor and ceiling.",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    description: "Explosive players, lower ownership, higher variance.",
  },
];

/** Ordered differential steps (also used to render the slider). */
export const DIFFERENTIAL_OPTIONS: PreferenceOption<DifferentialPreference>[] = [
  { value: "never", label: "Never", description: "Stick with the template." },
  {
    value: "occasionally",
    label: "Occasionally",
    description: "A rare punt when it's worth it.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "No ownership bias either way.",
  },
  {
    value: "prefer",
    label: "Prefer Differentials",
    description: "Lean toward lower-owned players.",
  },
  {
    value: "maximum",
    label: "Maximum Differentials",
    description: "Chase the lowest-owned upside.",
  },
];

export const PLANNING_HORIZON_OPTIONS: PreferenceOption<PlanningHorizon>[] = [
  { value: 1, label: "Next Gameweek", description: "Optimise for GW+1." },
  { value: 3, label: "Next 3 Gameweeks", description: "A short-term plan." },
  { value: 5, label: "Next 5 Gameweeks", description: "A medium-term plan." },
  { value: 8, label: "Next 8 Gameweeks", description: "A long-term plan." },
];

export const BUDGET_PHILOSOPHY_OPTIONS: PreferenceOption<BudgetPhilosophy>[] = [
  {
    value: "spend-every-penny",
    label: "Spend Every Penny",
    description: "Maximise on-pitch value.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Spend well, keep a little flexibility.",
  },
  {
    value: "leave-cash",
    label: "Leave Cash Available",
    description: "Hold funds for transfers & price rises.",
  },
];

export const ROTATION_TOLERANCE_OPTIONS: PreferenceOption<RotationTolerance>[] =
  [
    {
      value: "avoid",
      label: "Avoid Rotation",
      description: "Prioritise nailed-on starters.",
    },
    {
      value: "balanced",
      label: "Balanced",
      description: "Accept some rotation risk.",
    },
    {
      value: "high-risk",
      label: "High Risk High Reward",
      description: "Tolerate rotation for upside.",
    },
  ];

export const PLAYING_STYLE_OPTIONS: PreferenceOption<PlayingStyle>[] = [
  {
    value: "attack",
    label: "Attack",
    description: "Favour attacking returns.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "No positional bias.",
  },
  {
    value: "defence",
    label: "Defence",
    description: "Favour defensive assets.",
  },
];
