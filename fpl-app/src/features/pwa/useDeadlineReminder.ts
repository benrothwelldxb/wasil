import { useCallback, useEffect, useState } from "react";
import { useBootstrap } from "@/features/fpl";
import { usePwaStore } from "./store";

/** Notify this many ms before the deadline. */
const LEAD_MS = 2 * 60 * 60_000; // 2 hours
const TAG = "gw-deadline";

type Permission = "default" | "granted" | "denied" | "unsupported";

/** Notification Triggers API — fires even when the app is closed (Chromium). */
function supportsScheduling(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "showTrigger" in Notification.prototype &&
    "serviceWorker" in navigator
  );
}

export interface UseDeadlineReminderResult {
  /** Can this browser schedule a notification for when the app is closed? */
  canSchedule: boolean;
  permission: Permission;
  enabled: boolean;
  /** Turn the reminder on (requests permission) or off. */
  setEnabled: (on: boolean) => Promise<void>;
}

/**
 * Opt-in "team locks in 2 hours" reminder before each gameweek deadline.
 *
 * Uses the Notification Triggers API where available so it fires with the app
 * closed; on unsupported browsers it degrades to nothing scheduled (the toggle
 * explains this). Reschedules automatically as the next deadline changes.
 */
export function useDeadlineReminder(): UseDeadlineReminderResult {
  const bootstrap = useBootstrap();
  const enabled = usePwaStore((s) => s.reminderEnabled);
  const setReminderEnabled = usePwaStore((s) => s.setReminderEnabled);

  const canSchedule = supportsScheduling();
  const [permission, setPermission] = useState<Permission>(() =>
    "Notification" in window ? Notification.permission : "unsupported",
  );

  const deadline = bootstrap.data?.nextDeadline ?? null;
  const eventId = bootstrap.data?.nextEventId ?? null;

  const schedule = useCallback(async () => {
    if (!canSchedule || !deadline || eventId == null) return;
    if (Notification.permission !== "granted") return;
    const fireAt = new Date(deadline).getTime() - LEAD_MS;
    if (fireAt <= Date.now()) return; // too late to be useful

    const reg = await navigator.serviceWorker.ready;
    // Clear any previously-scheduled reminder so we don't stack duplicates.
    const existing = await reg.getNotifications({
      tag: TAG,
      // includeTriggered isn't in the DOM types yet.
      ...({ includeTriggered: true } as object),
    });
    existing.forEach((n) => n.close());

    await reg.showNotification("FPL deadline soon ⏳", {
      tag: TAG,
      body: `Gameweek ${eventId} locks in 2 hours — set your team!`,
      icon: "/icons/pwa-192.png",
      badge: "/favicon-32.png",
      data: { url: "/" },
      // TimestampTrigger / showTrigger aren't in the DOM types yet.
      ...({
        showTrigger: new (
          window as unknown as {
            TimestampTrigger: new (t: number) => unknown;
          }
        ).TimestampTrigger(fireAt),
      } as object),
    });
  }, [canSchedule, deadline, eventId]);

  // Reschedule whenever the deadline changes and the reminder is on.
  useEffect(() => {
    if (enabled && permission === "granted") void schedule();
  }, [enabled, permission, schedule]);

  const setEnabled = useCallback(
    async (on: boolean) => {
      if (!on) {
        setReminderEnabled(false);
        if (canSchedule) {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.getNotifications({
            tag: TAG,
            ...({ includeTriggered: true } as object),
          });
          existing.forEach((n) => n.close());
        }
        return;
      }
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        setReminderEnabled(true);
        await schedule();
      }
    },
    [canSchedule, schedule, setReminderEnabled],
  );

  return { canSchedule, permission, enabled, setEnabled };
}
