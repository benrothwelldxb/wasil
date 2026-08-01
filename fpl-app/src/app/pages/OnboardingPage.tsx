import { useNavigate } from "react-router-dom";
import { PageContainer, PageHeader } from "@/components/common";
import { OnboardingWizard } from "@/features/preferences";
import { ROUTES } from "@/routes/paths";

/**
 * Onboarding route: a guided flow to configure preferences and create the
 * user's first profile.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const goToPreferences = () => navigate(ROUTES.preferences);

  return (
    <PageContainer>
      <PageHeader
        title="Set up your preferences"
        description="Answer a few questions and we'll build a personalised profile."
      />
      <OnboardingWizard
        onComplete={goToPreferences}
        onSkip={goToPreferences}
      />
    </PageContainer>
  );
}
