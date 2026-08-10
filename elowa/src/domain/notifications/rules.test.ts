import { describe, it, expect } from 'vitest';
import { computeDueNotifications, DEFAULT_NOTIFICATION_PREFS } from './rules';
import type { NotificationPrefs } from '@/domain/models';

const prefs: NotificationPrefs = {
  ...DEFAULT_NOTIFICATION_PREFS,
  dailyCheckIn: true,
  meaningfulChanges: true,
  appointmentReminders: true,
};

const baseState = {
  prefs,
  today: '2026-05-20',
  checkedInToday: false,
  distinctDays: 30,
  dayOfWeek: 3,
  dayOfMonth: 20,
};

describe('computeDueNotifications', () => {
  it('reminds to check in when none today', () => {
    const due = computeDueNotifications(baseState);
    expect(due.some((d) => d.type === 'daily_checkin')).toBe(true);
  });

  it('does not remind to check in once checked in', () => {
    const due = computeDueNotifications({ ...baseState, checkedInToday: true });
    expect(due.some((d) => d.type === 'daily_checkin')).toBe(false);
  });

  it('shows a baseline nudge early on instead of a plain reminder', () => {
    const due = computeDueNotifications({ ...baseState, distinctDays: 3 });
    expect(due.some((d) => d.type === 'baseline')).toBe(true);
    expect(due.some((d) => d.type === 'daily_checkin')).toBe(false);
  });

  it('surfaces a meaningful change when enabled', () => {
    const due = computeDueNotifications({ ...baseState, meaningfulChange: { label: 'Sleep' } });
    expect(due.some((d) => d.type === 'meaningful_change')).toBe(true);
  });

  it('reminds the day before an appointment only', () => {
    const dueDayBefore = computeDueNotifications({ ...baseState, nextAppointmentDate: '2026-05-21' });
    expect(dueDayBefore.some((d) => d.type === 'appointment')).toBe(true);
    const dueTwoDays = computeDueNotifications({ ...baseState, nextAppointmentDate: '2026-05-22' });
    expect(dueTwoDays.some((d) => d.type === 'appointment')).toBe(false);
  });

  it('never contains streak/guilt language', () => {
    const due = computeDueNotifications({ ...baseState, meaningfulChange: { label: 'Sleep' } });
    for (const d of due) {
      expect(d.body.toLowerCase()).not.toContain('streak');
      expect(d.body.toLowerCase()).not.toContain('don’t lose');
    }
  });
});
