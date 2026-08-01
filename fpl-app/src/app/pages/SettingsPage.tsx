import { RotateCcw } from "lucide-react";
import {
  PageContainer,
  PageHeader,
  SectionCard,
  ThemeToggle,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { InstallButton } from "@/features/pwa";
import { usePreferenceStore } from "@/features/preferences";

/**
 * Settings page: appearance/theme, replaying the setup guide, and installing
 * the app to the home screen.
 */
export function SettingsPage() {
  const setOnboardingComplete = usePreferenceStore(
    (s) => s.setOnboardingComplete,
  );

  return (
    <PageContainer size="narrow">
      <PageHeader title="Settings" description="Configure your preferences." />
      <div className="space-y-4">
        <SectionCard
          title="Appearance"
          description="Choose light, dark, or match your system."
          actions={<ThemeToggle />}
        >
          <p className="text-sm text-muted-foreground">
            Your theme preference is saved to this device and applied
            automatically on your next visit.
          </p>
        </SectionCard>

        <SectionCard
          title="Getting started"
          description="New here, or want a refresher? Replay the quick setup guide."
        >
          <Button
            variant="outline"
            onClick={() => setOnboardingComplete(false)}
          >
            <RotateCcw className="h-4 w-4" />
            Replay setup guide
          </Button>
        </SectionCard>

        <SectionCard
          title="Install app"
          description="Use MyFPLScout like a native app — on Android and iPhone."
        >
          <InstallButton />
        </SectionCard>
      </div>
    </PageContainer>
  );
}
