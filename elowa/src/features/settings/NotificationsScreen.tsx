import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { HealthNotice } from '@/components/common/HealthNotice';
import { useCurrentUser, useSetPreferences } from '@/hooks/queries';
import type { NotificationPrefs, UserPreferences } from '@/domain/models';
import { todayIso } from '@/lib/date';

const ROWS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'dailyCheckIn', label: 'Daily check-in', hint: 'A gentle nudge if you haven’t checked in.' },
  { key: 'weeklyReflection', label: 'Weekly reflection', hint: 'A short weekly look back.' },
  { key: 'monthlySummary', label: 'Monthly summary', hint: 'Your month in elowa.' },
  { key: 'meaningfulChanges', label: 'Meaningful changes', hint: 'When something shifts from your usual pattern.' },
  { key: 'appointmentReminders', label: 'Appointment reminders', hint: 'When you have an appointment recorded.' },
];

export function NotificationsScreen() {
  const { data: user } = useCurrentUser();
  const setPrefs = useSetPreferences();
  const prefs = user?.preferences;
  const notif = prefs?.notifications;

  const patch = (next: Partial<UserPreferences>) => {
    if (!prefs) return;
    setPrefs.mutate({ ...prefs, ...next });
  };
  const toggle = (key: keyof NotificationPrefs) => {
    if (!notif) return;
    patch({ notifications: { ...notif, [key]: !notif[key] } });
  };

  return (
    <>
      <ScreenHeader eyebrow="Reminders" title="Notifications" showBack />
      <Screen>
        <p className="mt-1 text-sm text-muted-foreground">
          Restrained, useful reminders only — no streaks, no pressure. Turn on just what helps you.
        </p>

        <div className="mt-5">
          <SectionHeading>What to remind me about</SectionHeading>
          <Card className="divide-y divide-border/60">
            {ROWS.map((row) => (
              <div key={row.key} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.hint}</p>
                </div>
                <Switch
                  checked={Boolean(notif?.[row.key])}
                  onCheckedChange={() => toggle(row.key)}
                  aria-label={row.label}
                />
              </div>
            ))}
          </Card>
        </div>

        <div className="mt-5">
          <SectionHeading>Appointment</SectionHeading>
          <Card className="p-4">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="appt-date">
              Next appointment date
            </label>
            <input
              id="appt-date"
              type="date"
              min={todayIso()}
              value={prefs?.nextAppointmentDate ?? ''}
              onChange={(e) => patch({ nextAppointmentDate: e.target.value || undefined })}
              className="mt-1 h-11 w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              elowa will remind you the day before that your summary is ready.
            </p>
          </Card>
        </div>

        <HealthNotice className="mt-6" compact>
          In this web version, elowa can’t schedule phone notifications — that arrives with the
          native app. Your preferences are saved and reminders appear inside elowa in the meantime.
        </HealthNotice>
      </Screen>
    </>
  );
}
