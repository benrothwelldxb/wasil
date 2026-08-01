import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { PreferenceCenter, usePreferenceStore } from "@/features/preferences";
import { ROUTES } from "@/routes/paths";

/**
 * Preferences route: manage profiles and edit the active profile's
 * preferences, with a live preview of the PreferenceService's impact.
 */
export function PreferencesPage() {
  const onboardingComplete = usePreferenceStore((s) => s.onboardingComplete);

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Preferences"
        description="Personalise how recommendations are tuned. These preferences power every future engine."
        actions={
          !onboardingComplete && (
            <Button asChild>
              <Link to={ROUTES.onboarding}>
                <Sparkles className="h-4 w-4" />
                Guided setup
              </Link>
            </Button>
          )
        }
      />
      <PreferenceCenter />
    </PageContainer>
  );
}
