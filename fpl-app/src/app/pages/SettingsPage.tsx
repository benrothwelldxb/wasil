import {
  PageContainer,
  PageHeader,
  SectionCard,
  ThemeToggle,
} from "@/components/common";
import { InstallButton } from "@/features/pwa";

/**
 * Settings page: appearance/theme plus installing the app to the home screen.
 */
export function SettingsPage() {
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
          title="Install app"
          description="Use MyFPLScout like a native app — on Android and iPhone."
        >
          <InstallButton />
        </SectionCard>
      </div>
    </PageContainer>
  );
}
