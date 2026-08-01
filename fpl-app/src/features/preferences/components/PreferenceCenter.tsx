import { Info } from "lucide-react";
import { useTeams } from "@/features/fpl";
import { SectionCard } from "@/components/common";
import { useActiveProfile } from "../usePreferences";
import { usePreferenceStore } from "../preferenceStore";
import type { Preferences } from "../schema";
import { PreferenceControls } from "./PreferenceControls";
import { ProfileManager } from "./ProfileManager";
import { PreferencePreview } from "./PreferencePreview";

/**
 * The preferences "command centre": edit the active profile, manage all
 * profiles (CRUD + import/export), and preview the live PreferenceService
 * impact — everything except onboarding.
 */
export function PreferenceCenter() {
  const { data: teams } = useTeams();
  const activeProfile = useActiveProfile();
  const updatePreferences = usePreferenceStore(
    (s) => s.updateProfilePreferences,
  );

  const handleChange = (patch: Partial<Preferences>) => {
    updatePreferences(activeProfile.id, patch);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <SectionCard
          title={`Editing: ${activeProfile.name}`}
          description={
            activeProfile.builtIn
              ? undefined
              : "Changes are saved to this profile automatically."
          }
        >
          {activeProfile.builtIn && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">{activeProfile.name}</strong>{" "}
                is a built-in profile. Editing it will create a custom copy you
                can freely change.
              </span>
            </div>
          )}
          <PreferenceControls
            value={activeProfile.preferences}
            onChange={handleChange}
            teams={teams ?? []}
          />
        </SectionCard>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <SectionCard title="Profiles" description="Switch, duplicate, or manage.">
          <ProfileManager />
        </SectionCard>
        <PreferencePreview />
      </aside>
    </div>
  );
}
