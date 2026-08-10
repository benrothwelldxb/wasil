import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { HealthNotice } from '@/components/common/HealthNotice';
import { Icon } from '@/components/ui/icon';
import { useCurrentUser, useSetPreferences } from '@/hooks/queries';

const POINTS = [
  'AI is optional — tracking and insights work fully without it.',
  'It only rewords the patterns elowa already found; it never analyses your raw data or invents conclusions.',
  'AI does not diagnose and never makes treatment decisions.',
  'You can turn it off any time and keep everything local.',
];

export function AIScreen() {
  const { data: user } = useCurrentUser();
  const setPrefs = useSetPreferences();
  const ai = user?.preferences.ai;
  const enabled = Boolean(ai?.enabled && ai?.consentedAt);

  const enable = () => {
    if (!user) return;
    setPrefs.mutate({ ...user.preferences, ai: { enabled: true, consentedAt: new Date().toISOString() } });
  };
  const disable = () => {
    if (!user) return;
    setPrefs.mutate({ ...user.preferences, ai: { ...user.preferences.ai, enabled: false } });
  };

  return (
    <>
      <ScreenHeader eyebrow="Optional" title="AI summaries" showBack />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          elowa can use AI to turn your existing patterns and notes into easier-to-read summaries.
        </p>

        <Card className="mt-5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">AI summaries</p>
            <Badge variant={enabled ? 'positive' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>
          </div>
          <ul className="mt-3 space-y-2">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Icon name="Check" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="mt-4 p-4">
          <p className="text-sm font-semibold text-foreground">What would be sent</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Only the short, already-safe pattern findings elowa generated (and, if you allow it,
            excerpts of your notes) — never your raw daily logs. In this build the summaries are
            produced on your device and nothing leaves it; a future cloud AI option would use a
            secure server and always ask again first.
          </p>
        </Card>

        <div className="mt-5">
          {enabled ? (
            <Button variant="outline" size="lg" className="w-full" onClick={disable}>
              Keep everything local (turn AI off)
            </Button>
          ) : (
            <PrimaryButton onClick={enable}>Use AI summaries</PrimaryButton>
          )}
        </div>

        <HealthNotice className="mt-6" compact>
          If AI is ever unavailable or its wording doesn’t pass elowa’s safety checks, you’ll always
          see the plain deterministic summary instead — never a blank screen.
        </HealthNotice>
      </Screen>
    </>
  );
}
