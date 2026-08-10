import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Icon } from '@/components/ui/icon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { PrivacyNote } from '@/components/common/PrivacyNote';
import { HealthNotice } from '@/components/common/HealthNotice';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import {
  useCheckIns,
  useCurrentUser,
  useDataMode,
  useDeleteAllData,
  useSetPreferences,
} from '@/hooks/queries';
import { downloadExport } from '@/services/dataManagement';
import { downloadCsv } from '@/services/export/csv';
import { cn } from '@/lib/utils';

export function ProfileScreen() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: checkIns } = useCheckIns();
  const setPreferences = useSetPreferences();
  const deleteAll = useDeleteAllData();
  const { mode, enterDemo, exitDemo, resetDemo } = useDataMode();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const reminders = user?.preferences.remindersEnabled ?? false;
  const name = user?.profile.displayName;
  const pinnedCount = user?.pinnedSymptomIds.length ?? 0;
  const aiOn = Boolean(user?.preferences.ai?.enabled && user?.preferences.ai?.consentedAt);

  const toggleReminders = () => {
    if (!user) return;
    setPreferences.mutate({ ...user.preferences, remindersEnabled: !reminders });
  };
  const exportCsv = () => downloadCsv(checkIns ?? [], new Date().toISOString());

  return (
    <>
      <ScreenHeader eyebrow="Settings" title="Me" />
      <Screen>
        <Card className="mt-1 flex items-center gap-4 p-5">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
            {name?.[0]?.toUpperCase() ?? 'E'}
          </span>
          <div>
            <p className="text-lg font-semibold text-foreground">{name ?? 'You'}</p>
            <p className="text-sm text-muted-foreground">
              {user?.profile.age ? `${user.profile.age} years old · ` : ''}Private, on this device
            </p>
          </div>
        </Card>

        <div className="mt-6">
          <SectionHeading>Tracking</SectionHeading>
          <Card className="divide-y divide-border/60">
            <Row icon="Sparkles" label="My symptoms" detail={`${pinnedCount} pinned`} />
            <Row icon="Droplet" label="Cycle" onClick={() => navigate('/cycle')} />
            <Row icon="Pill" label="Treatments" onClick={() => navigate('/treatments')} />
            <Row icon="FileText" label="Appointment summary" onClick={() => navigate('/appointment')} />
            <Row
              icon="Bell"
              label="Daily reminder"
              trailing={<Switch checked={reminders} onCheckedChange={toggleReminders} aria-label="Daily reminder" />}
            />
          </Card>
        </div>

        <div className="mt-6">
          <SectionHeading>Understanding</SectionHeading>
          <Card className="divide-y divide-border/60">
            <Row icon="Activity" label="Connect health data" onClick={() => navigate('/health')} />
            <Row icon="Sparkles" label="AI summaries" detail={aiOn ? 'On' : 'Off'} onClick={() => navigate('/ai')} />
            <Row icon="Bell" label="Notifications" onClick={() => navigate('/notifications')} />
          </Card>
        </div>

        <div className="mt-6">
          <SectionHeading>Privacy & data</SectionHeading>
          <Card className="divide-y divide-border/60">
            <Row icon="Shield" label="Data & privacy" onClick={() => navigate('/privacy')} />
            <Row icon="Download" label="Export archive (JSON)" onClick={() => downloadExport(new Date().toISOString())} />
            <Row icon="FileText" label="Export tracking (CSV)" onClick={exportCsv} />
            <Row icon="Trash2" label="Delete all my data" destructive onClick={() => setConfirmDelete(true)} />
          </Card>
        </div>

        <div className="mt-6">
          <SectionHeading>Developer</SectionHeading>
          <Card className="divide-y divide-border/60">
            {mode === 'demo' ? (
              <>
                <Row icon="RotateCcw" label="Reset demo data" onClick={() => resetDemo()} />
                <Row icon="ArrowRight" label="Exit demo mode" onClick={() => exitDemo()} />
              </>
            ) : (
              <Row icon="Sparkles" label="Load demo data" detail="Fictional example user" onClick={() => enterDemo()} />
            )}
          </Card>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Demo data is stored separately and never mixed with your own.
          </p>
        </div>

        <HealthNotice className="mt-7" compact />
        <PrivacyNote className="mt-4" />
      </Screen>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={mode === 'demo' ? 'Clear demo data?' : 'Delete all your data?'}
        description={
          <>
            This permanently removes all {mode === 'demo' ? 'demo ' : ''}check-ins, cycle records,
            treatments, notes and settings stored on this device. This can’t be undone
            {mode === 'demo' ? '.' : ', and you’ll return to onboarding.'}
          </>
        }
        confirmLabel="Delete everything"
        destructive
        onConfirm={() => deleteAll.mutate(undefined, { onSuccess: () => navigate('/today') })}
      />
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
  const interactive = !trailing && !disabled && Boolean(onClick);
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
      <span className={cn('flex-1 text-sm font-medium', destructive ? 'text-attention' : 'text-foreground')}>
        {label}
      </span>
      {detail ? <span className="text-sm text-muted-foreground">{detail}</span> : null}
      {trailing ?? (interactive ? <Icon name="ChevronRight" className="size-5 text-muted-foreground" /> : null)}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {content}
      </button>
    );
  }
  return <div className="flex min-h-14 items-center gap-3 p-4">{content}</div>;
}
