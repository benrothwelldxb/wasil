import { useState } from 'react';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { HealthNotice } from '@/components/common/HealthNotice';
import { Icon } from '@/components/ui/icon';
import {
  useHealthCapabilities,
  useHealthPermissions,
  useConnectHealth,
  useDisconnectHealth,
  useLatestHealthSample,
} from '@/hooks/queries';
import { METRIC_LABEL } from '@/domain/health';
import type { HealthMetricKind } from '@/domain/models';
import { cn } from '@/lib/utils';

export function HealthConnectScreen() {
  const { data: caps } = useHealthCapabilities();
  const { data: perms } = useHealthPermissions();
  const { data: latest } = useLatestHealthSample();
  const connect = useConnectHealth();
  const disconnect = useDisconnectHealth();

  const supported = caps?.supported ?? [];
  const grantedKinds = new Set((perms ?? []).filter((p) => p.granted).map((p) => p.kind));
  const isConnected = grantedKinds.size > 0;
  const [selected, setSelected] = useState<Set<HealthMetricKind>>(new Set(supported));

  const toggle = (k: HealthMetricKind) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <>
      <ScreenHeader eyebrow="Passive data" title="Connect your health data" showBack />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          elowa can use information such as sleep and activity to help you understand your patterns
          — without asking you to log everything manually. This is optional.
        </p>

        {!caps?.connectable ? (
          <Card className="mt-5 p-5">
            <div className="flex items-center gap-2">
              <Icon name="Info" className="size-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">Not available in this browser</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Connecting Apple Health or Health Connect needs the elowa app on your phone. In this
              web version, elowa never reads your device health data. You can still track everything
              manually, and your deterministic insights work fully without it.
            </p>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              When available, elowa would ask permission to read:
            </p>
            <ul className="mt-1 space-y-1 text-sm text-foreground">
              {(['sleep_duration', 'sleep_consistency', 'steps', 'active_minutes'] as HealthMetricKind[]).map(
                (k) => (
                  <li key={k} className="flex items-center gap-2">
                    <Icon name="Check" className="size-4 text-primary" /> {METRIC_LABEL[k]}
                  </li>
                ),
              )}
            </ul>
          </Card>
        ) : isConnected ? (
          <Card className="mt-5 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-success/15 text-success">
                  <Icon name="Check" className="size-5" />
                </span>
                <p className="text-sm font-semibold text-foreground">Connected · {caps?.label}</p>
              </div>
              <Badge variant="positive">Active</Badge>
            </div>
            {latest?.sleepMinutes ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Latest sleep read: {Math.floor(latest.sleepMinutes / 60)}h {latest.sleepMinutes % 60}m
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...grantedKinds].map((k) => (
                <Badge key={k} variant="neutral">
                  {METRIC_LABEL[k]}
                </Badge>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-attention hover:bg-attention/10"
              onClick={() => disconnect.mutate()}
            >
              Disconnect
            </Button>
          </Card>
        ) : (
          <>
            <Card className="mt-5 p-5">
              <p className="text-sm font-semibold text-foreground">Choose what elowa can read</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Grant only what you're comfortable with. You can change this any time.
              </p>
              <div className="mt-3 space-y-2">
                {supported.map((k) => {
                  const on = selected.has(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(k)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        on ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:bg-muted/50',
                      )}
                    >
                      <Icon name={on ? 'Check' : 'Circle'} className={cn('size-4', on ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-sm font-medium text-foreground">{METRIC_LABEL[k]}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
            <div className="mt-5 space-y-2.5">
              <PrimaryButton onClick={() => connect.mutate([...selected])} disabled={selected.size === 0 || connect.isPending}>
                Connect
              </PrimaryButton>
              <Button variant="ghost" size="lg" className="w-full" onClick={() => history.back()}>
                Not now
              </Button>
            </div>
          </>
        )}

        <HealthNotice className="mt-6" compact>
          Passive data is read on your device and used only to help explain your patterns. elowa
          never uploads it, and you can disconnect at any time.
        </HealthNotice>
      </Screen>
    </>
  );
}
