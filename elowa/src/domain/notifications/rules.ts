/**
 * Notification rules (Phase 2, deterministic).
 *
 * Decides which restrained reminders are *due* given the current state and the
 * user's granular preferences. There is deliberately NO streak/guilt logic.
 * Actual OS delivery is a native concern (documented in `docs/NOTIFICATIONS.md`);
 * this module is the pure decision layer and is what the in-app reminders
 * surface renders.
 */

import type { NotificationPrefs } from '@/domain/models';
import { addDays, daysBetween, type IsoDate } from '@/lib/date';
import { BASELINE } from '@/domain/analysis/thresholds';

export type NotificationType =
  | 'daily_checkin'
  | 'baseline'
  | 'meaningful_change'
  | 'weekly_reflection'
  | 'monthly_summary'
  | 'appointment';

export interface DueNotification {
  type: NotificationType;
  title: string;
  body: string;
}

export interface NotificationState {
  prefs: NotificationPrefs;
  today: IsoDate;
  /** True if a check-in already exists for today. */
  checkedInToday: boolean;
  distinctDays: number;
  /** A meaningful sustained change to surface, if any (already computed). */
  meaningfulChange?: { label: string };
  nextAppointmentDate?: IsoDate;
  /** Day-of-week (0 Sun … 6 Sat) and day-of-month for weekly/monthly cadence. */
  dayOfWeek: number;
  dayOfMonth: number;
}

export function computeDueNotifications(state: NotificationState): DueNotification[] {
  const out: DueNotification[] = [];
  const { prefs } = state;

  if (prefs.dailyCheckIn && !state.checkedInToday) {
    if (state.distinctDays > 0 && state.distinctDays < BASELINE.MIN_DAYS) {
      out.push({
        type: 'baseline',
        title: 'A few quick check-ins',
        body: 'A few quick check-ins will help elowa learn what’s usual for you.',
      });
    } else {
      out.push({
        type: 'daily_checkin',
        title: 'Ready when you are',
        body: 'You haven’t checked in today.',
      });
    }
  }

  if (prefs.meaningfulChanges && state.meaningfulChange) {
    out.push({
      type: 'meaningful_change',
      title: 'Worth a look',
      body: `Your ${state.meaningfulChange.label.toLowerCase()} has been different from your usual pattern this week.`,
    });
  }

  if (prefs.weeklyReflection && state.dayOfWeek === 0) {
    out.push({
      type: 'weekly_reflection',
      title: 'Your week in elowa',
      body: 'A short reflection on your week is ready.',
    });
  }

  if (prefs.monthlySummary && state.dayOfMonth === 1) {
    out.push({
      type: 'monthly_summary',
      title: 'Your month in elowa',
      body: 'Your monthly reflection is ready.',
    });
  }

  if (prefs.appointmentReminders && state.nextAppointmentDate) {
    const untilAppt = daysBetween(state.today, state.nextAppointmentDate);
    if (untilAppt === 1) {
      out.push({
        type: 'appointment',
        title: 'Appointment tomorrow',
        body: 'Your elowa summary is ready for tomorrow.',
      });
    }
  }

  return out;
}

/** Convenience: the appointment "ready" window (tomorrow) for a given date. */
export function appointmentReminderDate(appointment: IsoDate): IsoDate {
  return addDays(appointment, -1);
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  dailyCheckIn: false,
  weeklyReflection: false,
  monthlySummary: true,
  meaningfulChanges: true,
  appointmentReminders: true,
};
