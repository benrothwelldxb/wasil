import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { PrivacyNote } from '@/components/common/PrivacyNote';
import { HealthNotice } from '@/components/common/HealthNotice';
import { useCurrentUser } from '@/hooks/queries';
import { cn } from '@/lib/utils';

export function ProfileScreen() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const [reminders, setReminders] = useState(user?.preferences.remindersEnabled ?? true);

  return (
    <>
      <ScreenHeader eyebrow="Settings" title="Me" />
      <Screen>
        {/* Identity */}
        <Card className="mt-1 flex items-center gap-4 p-5">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
            {user?.displayName?.[0] ?? 'E'}
          </span>
          <div>
            <p className="text-lg font-semibold text-foreground">{user?.displayName ?? 'You'}</p>
            {user?.age ? (
              <p className="text-sm text-muted-foreground">{user.age} years old</p>
            ) : null}
          </div>
        </Card>

        <div className="mt-6">
          <SectionHeading>Tracking</SectionHeading>
          <Card className="divide-y divide-border/60">
            <Row icon="Sparkles" label="My symptoms" detail="6 pinned" />
            <Row
              icon="CalendarClock"
              label="Cycle & history"
              onClick={() => navigate('/calendar')}
            />
            <Row
              icon="Pill"
              label="Treatments"
              detail="4 recorded"
              onClick={() => navigate('/appointment')}
            />
            <Row
              icon="FileText"
              label="Appointment summary"
              onClick={() => navigate('/appointment')}
            />
            <Row
              icon="Bell"
              label="Reminder settings"
              trailing={
                <Switch
                  checked={reminders}
                  onCheckedChange={setReminders}
                  aria-label="Daily reminders"
                />
              }
            />
          </Card>
        </div>

        <div className="mt-6">
          <SectionHeading>Privacy & data</SectionHeading>
          <Card className="divide-y divide-border/60">
            <Row icon="Shield" label="Data & privacy" />
            <Row icon="Download" label="Export my data" />
            <Row icon="Trash2" label="Delete my data" destructive />
          </Card>
        </div>

        <div className="mt-6">
          <SectionHeading>Health integrations</SectionHeading>
          <Card className="divide-y divide-border/60">
            <Row
              icon="Activity"
              label="Apple Health"
              trailing={<Badge variant="neutral">Coming soon</Badge>}
              disabled
            />
            <Row
              icon="HeartPulse"
              label="Health Connect"
              trailing={<Badge variant="neutral">Coming soon</Badge>}
              disabled
            />
          </Card>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Integrations are not enabled in this version.
          </p>
        </div>

        <HealthNotice className="mt-7" compact />
        <PrivacyNote className="mt-4" />
      </Screen>
    </>
  );
}

function Row({
  icon,
  label,
  detail,
  trailing,
  destructive = false,
  disabled = false,
  onClick,
}: {
  icon: string;
  label: string;
  detail?: string;
  trailing?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const interactive = !trailing && !disabled;
  const content = (
    <>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          destructive ? 'bg-attention/15 text-attention' : 'bg-muted text-foreground',
        )}
      >
        <Icon name={icon} className="size-5" />
      </span>
      <span
        className={cn(
          'flex-1 text-sm font-medium',
          destructive ? 'text-attention' : 'text-foreground',
        )}
      >
        {label}
      </span>
      {detail ? <span className="text-sm text-muted-foreground">{detail}</span> : null}
      {trailing ?? (
        <Icon name="ChevronRight" className="size-5 text-muted-foreground" />
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full min-h-14 items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {content}
      </button>
    );
  }

  return <div className="flex min-h-14 items-center gap-3 p-4">{content}</div>;
}
