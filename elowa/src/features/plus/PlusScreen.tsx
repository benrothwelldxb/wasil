import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { useEntitlement, useSetTier } from '@/hooks/queries';
import { effectiveTier } from '@/domain/entitlements/entitlements';

const PLUS_FEATURES = [
  { icon: 'LineChart', title: 'Deeper pattern detection', detail: 'More of the connections in your data, surfaced sooner.' },
  { icon: 'CalendarClock', title: 'Before & after comparisons', detail: 'See what shifted around a treatment or a date that mattered.' },
  { icon: 'FileText', title: 'Monthly reflections', detail: 'A gentle written summary of each month.' },
  { icon: 'Sparkles', title: 'AI-worded summaries', detail: 'Your insights, phrased warmly — on-device consent, always optional.' },
  { icon: 'BookOpen', title: 'Full report history', detail: 'Keep and revisit every summary you generate.' },
];

const ALWAYS_FREE = [
  'Daily tracking & your personal baseline',
  'The Elowa Timeline',
  'Cloud backup so you never lose your history',
  'Sharing with a clinician or partner',
  'Exporting and deleting all your data',
];

export function PlusScreen() {
  const { data: entitlement } = useEntitlement();
  const setTier = useSetTier();
  const isPlus = entitlement ? effectiveTier(entitlement) === 'plus' : false;

  return (
    <>
      <ScreenHeader eyebrow="Membership" title="elowa Plus" showBack />
      <Screen>
        <Card className="mt-1 p-5 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="Sparkles" className="size-7" />
          </span>
          <p className="mt-3 text-lg font-semibold text-foreground">
            {isPlus ? 'You’re on Plus' : 'A little more understanding'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            elowa is fully usable for free. Plus adds deeper analysis and warmer summaries — never
            access to your own data.
          </p>
          {isPlus ? <Badge variant="positive" className="mt-3">Active</Badge> : null}
        </Card>

        <div className="mt-6 space-y-3">
          {PLUS_FEATURES.map((f) => (
            <Card key={f.title} className="flex items-start gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Icon name={f.icon} className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.detail}</p>
              </div>
            </Card>
          ))}
        </div>

        <Card className="mt-6 p-5">
          <p className="text-sm font-semibold text-foreground">Always free</p>
          <ul className="mt-2 space-y-1.5">
            {ALWAYS_FREE.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Icon name="Check" className="mt-0.5 size-4 shrink-0 text-success" />
                {f}
              </li>
            ))}
          </ul>
        </Card>

        <div className="mt-6 space-y-2.5">
          {isPlus ? (
            <Button variant="outline" size="lg" className="w-full" onClick={() => setTier.mutate('free')}>
              Switch back to free
            </Button>
          ) : (
            <>
              <PrimaryButton onClick={() => setTier.mutate('plus')}>Start elowa Plus</PrimaryButton>
              <Button variant="ghost" size="lg" className="w-full" onClick={() => setTier.mutate('plus')}>
                Restore a purchase
              </Button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          In this build, billing is simulated on-device. In the mobile app, Plus is handled by the App
          Store or Google Play, and restoring re-checks your existing purchase.
        </p>
      </Screen>
    </>
  );
}
