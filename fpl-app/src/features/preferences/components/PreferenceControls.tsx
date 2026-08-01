import type { Team } from "@/features/fpl";
import { SegmentedField } from "./SegmentedField";
import {
  DifferentialSlider,
  FavouriteClubField,
  FormFixturesField,
  PreferenceSection,
} from "./fields";
import {
  BUDGET_PHILOSOPHY_OPTIONS,
  PLANNING_HORIZON_OPTIONS,
  PLAYING_STYLE_OPTIONS,
  RECOMMENDATION_STYLE_OPTIONS,
  RISK_PROFILE_OPTIONS,
  ROTATION_TOLERANCE_OPTIONS,
} from "../options";
import type { Preferences } from "../schema";

export interface PreferenceControlsProps {
  value: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  teams: Team[];
  /** Which sections to render; omitted renders all (used by onboarding steps). */
  sections?: PreferenceSectionKey[];
}

export type PreferenceSectionKey =
  | "club"
  | "style"
  | "risk"
  | "differential"
  | "horizon"
  | "budget"
  | "form"
  | "rotation"
  | "playing";

const ALL_SECTIONS: PreferenceSectionKey[] = [
  "club",
  "style",
  "risk",
  "differential",
  "horizon",
  "budget",
  "form",
  "rotation",
  "playing",
];

/**
 * The full, reusable set of preference controls. Render everything (settings)
 * or a subset via `sections` (onboarding steps). Fully controlled.
 */
export function PreferenceControls({
  value,
  onChange,
  teams,
  sections = ALL_SECTIONS,
}: PreferenceControlsProps) {
  const show = (key: PreferenceSectionKey) => sections.includes(key);

  return (
    <div className="space-y-6">
      {show("club") && (
        <PreferenceSection
          title="Favourite Premier League Club"
          description="Only ever an optional weighting — it never forces players into recommendations."
        >
          <FavouriteClubField
            teams={teams}
            value={value.favouriteClubId}
            onChange={(favouriteClubId) => onChange({ favouriteClubId })}
          />
        </PreferenceSection>
      )}

      {show("style") && (
        <PreferenceSection title="Recommendation Style">
          <SegmentedField
            options={RECOMMENDATION_STYLE_OPTIONS}
            value={value.recommendationStyle}
            onChange={(recommendationStyle) => onChange({ recommendationStyle })}
            columns={4}
            ariaLabel="Recommendation style"
          />
        </PreferenceSection>
      )}

      {show("risk") && (
        <PreferenceSection title="Risk Profile">
          <SegmentedField
            options={RISK_PROFILE_OPTIONS}
            value={value.riskProfile}
            onChange={(riskProfile) => onChange({ riskProfile })}
            columns={3}
            ariaLabel="Risk profile"
          />
        </PreferenceSection>
      )}

      {show("differential") && (
        <PreferenceSection
          title="Differential Preference"
          description="Influences ownership weighting during optimisation."
        >
          <DifferentialSlider
            value={value.differentialPreference}
            onChange={(differentialPreference) =>
              onChange({ differentialPreference })
            }
          />
        </PreferenceSection>
      )}

      {show("horizon") && (
        <PreferenceSection
          title="Planning Horizon"
          description="Future optimisation engines use this window automatically."
        >
          <SegmentedField
            options={PLANNING_HORIZON_OPTIONS}
            value={value.planningHorizon}
            onChange={(planningHorizon) => onChange({ planningHorizon })}
            columns={4}
            ariaLabel="Planning horizon"
          />
        </PreferenceSection>
      )}

      {show("budget") && (
        <PreferenceSection title="Budget Philosophy">
          <SegmentedField
            options={BUDGET_PHILOSOPHY_OPTIONS}
            value={value.budgetPhilosophy}
            onChange={(budgetPhilosophy) => onChange({ budgetPhilosophy })}
            columns={3}
            ariaLabel="Budget philosophy"
          />
        </PreferenceSection>
      )}

      {show("form") && (
        <PreferenceSection title="Form vs Fixtures">
          <FormFixturesField
            value={value.formBias}
            onChange={(formBias) => onChange({ formBias })}
          />
        </PreferenceSection>
      )}

      {show("rotation") && (
        <PreferenceSection title="Rotation Tolerance">
          <SegmentedField
            options={ROTATION_TOLERANCE_OPTIONS}
            value={value.rotationTolerance}
            onChange={(rotationTolerance) => onChange({ rotationTolerance })}
            columns={3}
            ariaLabel="Rotation tolerance"
          />
        </PreferenceSection>
      )}

      {show("playing") && (
        <PreferenceSection title="Preferred Playing Style">
          <SegmentedField
            options={PLAYING_STYLE_OPTIONS}
            value={value.playingStyle}
            onChange={(playingStyle) => onChange({ playingStyle })}
            columns={3}
            ariaLabel="Preferred playing style"
          />
        </PreferenceSection>
      )}
    </div>
  );
}
