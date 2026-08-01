import {
  PageContainer,
  PageHeader,
  SectionCard,
  ThemeToggle,
} from "@/components/common";

/**
 * Placeholder settings page. Wires up the reusable theme toggle so the
 * theming system is demonstrable end-to-end.
 */
export function SettingsPage() {
  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Settings"
        description="Configure your preferences."
      />
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
    </PageContainer>
  );
}
