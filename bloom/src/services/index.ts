/**
 * Application services.
 *
 * Each function returns a Promise and is the ONLY place components/hooks reach
 * for data. Today they read from the mock data layer; tomorrow they call a real
 * API. Keeping this boundary is what lets a backend arrive without refactoring
 * the UI.
 */

import type {
  AppointmentSummary,
  CycleEntry,
  DailyCheckIn,
  Insight,
  LearningArticle,
  PeriodEntry,
  TreatmentEvent,
  User,
} from '@/domain/models';
import type { IsoDate } from '@/lib/date';
import {
  MOCK_APPOINTMENT,
  MOCK_ARTICLES,
  MOCK_CHECKINS,
  MOCK_CYCLES,
  MOCK_INSIGHTS,
  MOCK_PERIODS,
  MOCK_TREATMENTS,
  MOCK_USER,
  checkInForDate,
  findArticle,
} from '@/data/mock';
import { resolveMock } from './mockDelay';

export const userService = {
  getCurrentUser(): Promise<User> {
    return resolveMock(MOCK_USER);
  },
};

export const checkInService = {
  list(): Promise<DailyCheckIn[]> {
    return resolveMock([...MOCK_CHECKINS]);
  },
  getByDate(date: IsoDate): Promise<DailyCheckIn | null> {
    return resolveMock(checkInForDate(date) ?? null);
  },
};

export const cycleService = {
  listCycles(): Promise<CycleEntry[]> {
    return resolveMock([...MOCK_CYCLES]);
  },
  listPeriods(): Promise<PeriodEntry[]> {
    return resolveMock([...MOCK_PERIODS]);
  },
};

export const treatmentService = {
  list(): Promise<TreatmentEvent[]> {
    return resolveMock([...MOCK_TREATMENTS]);
  },
};

export const insightService = {
  list(): Promise<Insight[]> {
    return resolveMock([...MOCK_INSIGHTS]);
  },
};

export const appointmentService = {
  getLatestSummary(): Promise<AppointmentSummary> {
    return resolveMock(MOCK_APPOINTMENT);
  },
};

export const articleService = {
  list(): Promise<LearningArticle[]> {
    return resolveMock([...MOCK_ARTICLES]);
  },
  getBySlug(slug: string): Promise<LearningArticle | null> {
    return resolveMock(findArticle(slug) ?? null);
  },
};

/** Centralised React Query keys — one source of truth for cache invalidation. */
export const queryKeys = {
  currentUser: ['currentUser'] as const,
  checkIns: ['checkIns'] as const,
  checkIn: (date: string) => ['checkIns', date] as const,
  cycles: ['cycles'] as const,
  periods: ['periods'] as const,
  treatments: ['treatments'] as const,
  insights: ['insights'] as const,
  appointmentSummary: ['appointmentSummary'] as const,
  articles: ['articles'] as const,
  article: (slug: string) => ['articles', slug] as const,
};
