import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeadlineReminder } from "../useDeadlineReminder";

/**
 * Settings control to opt into a "team locks in 2 hours" reminder before each
 * deadline. Honest about browser support (scheduled notifications need a
 * Chromium browser with the app installed).
 */
export function DeadlineReminderToggle() {
  const { canSchedule, permission, enabled, setEnabled } =
    useDeadlineReminder();

  if (!canSchedule) {
    return (
      <p className="text-sm text-muted-foreground">
        Pre-deadline reminders aren't supported in this browser yet. Install the
        app on Android/Chrome to get "team locks in 2 hours" alerts.
      </p>
    );
  }

  if (permission === "denied") {
    return (
      <p className="text-sm text-muted-foreground">
        Notifications are blocked for this site. Enable them in your browser
        settings, then turn the reminder on here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        We'll remind you <strong>2 hours before</strong> each gameweek deadline
        so you never miss setting your team.
      </p>
      {enabled ? (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-[hsl(var(--brand-green))]">
            <Bell className="h-4 w-4" /> Reminder on
          </span>
          <Button variant="outline" size="sm" onClick={() => setEnabled(false)}>
            <BellOff className="h-4 w-4" />
            Turn off
          </Button>
        </div>
      ) : (
        <Button onClick={() => setEnabled(true)}>
          <Bell className="h-4 w-4" />
          Remind me before deadlines
        </Button>
      )}
    </div>
  );
}
