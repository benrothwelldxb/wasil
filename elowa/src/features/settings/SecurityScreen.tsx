import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { PrivacyNote } from '@/components/common/PrivacyNote';
import { useAppLock, useSetAppLock, useConsents, useSetConsent } from '@/hooks/queries';
import type { ConsentType } from '@/domain/models';
import { formatDayMonth } from '@/lib/date';

const CONSENTS: { type: ConsentType; label: string; detail: string }[] = [
  { type: 'ai_processing', label: 'AI-worded summaries', detail: 'Let elowa reword your insights more warmly.' },
  { type: 'health_integration', label: 'Health data', detail: 'Read sleep and activity to enrich patterns.' },
  { type: 'partner_sharing', label: 'Partner sharing', detail: 'Allow lighter summaries to be shared with someone close.' },
  { type: 'marketing', label: 'Product updates', detail: 'Occasional news about elowa. Off by default.' },
];

export function SecurityScreen() {
  const { data: locked } = useAppLock();
  const setLock = useSetAppLock();
  const { data: consents } = useConsents();
  const setConsent = useSetConsent();

  const hasConsent = (t: ConsentType) =>
    (consents ?? []).some((c) => c.type === t && !c.withdrawnAt);
  const grantedAt = (t: ConsentType) =>
    (consents ?? []).find((c) => c.type === t && !c.withdrawnAt)?.grantedAt;

  return (
    <>
      <ScreenHeader eyebrow="Privacy & security" title="Lock & permissions" showBack />
      <Screen>
        <div className="mt-1">
          <SectionHeading>App lock</SectionHeading>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground">
                <Icon name="Fingerprint" className="size-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Require unlock to open elowa</p>
                <p className="text-xs text-muted-foreground">
                  Keeps your tracking private on a shared device.
                </p>
              </div>
              <Switch
                checked={locked ?? false}
                onCheckedChange={(on) => setLock.mutate(on)}
                aria-label="Require unlock"
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              On the elowa mobile app this uses Face ID or your device passcode. In this browser it’s a
              simple on-open lock.
            </p>
          </Card>
        </div>

        <div className="mt-6">
          <SectionHeading>Notifications stay private</SectionHeading>
          <Card className="p-4">
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Icon name="Heart" className="size-4" />
                </span>
                <span className="text-sm font-semibold text-foreground">elowa</span>
              </div>
              <p className="mt-1.5 text-sm text-foreground">A gentle check-in whenever you’re ready 🌸</p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Reminders and nudges never include a symptom, note or any health detail — only a soft prompt.
            </p>
          </Card>
        </div>

        <div className="mt-6">
          <SectionHeading>What you’ve allowed</SectionHeading>
          <Card className="divide-y divide-border/60">
            {CONSENTS.map((c) => (
              <div key={c.type} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{c.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {hasConsent(c.type) && grantedAt(c.type)
                      ? `Allowed ${formatDayMonth(grantedAt(c.type)!.slice(0, 10))}`
                      : c.detail}
                  </p>
                </div>
                <Switch
                  checked={hasConsent(c.type)}
                  onCheckedChange={(on) => setConsent.mutate({ type: c.type, granted: on })}
                  aria-label={c.label}
                />
              </div>
            ))}
          </Card>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            You can withdraw any permission here at any time. Turning something off stops it going forward.
          </p>
        </div>

        <PrivacyNote className="mt-7" />
      </Screen>
    </>
  );
}
