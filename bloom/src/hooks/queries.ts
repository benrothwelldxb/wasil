/**
 * TanStack Query hooks. Components use these rather than calling services
 * directly, so caching, loading and error states are handled consistently.
 */

import { useQuery } from '@tanstack/react-query';
import {
  appointmentService,
  articleService,
  checkInService,
  cycleService,
  insightService,
  queryKeys,
  treatmentService,
  userService,
} from '@/services';
import type { IsoDate } from '@/lib/date';

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => userService.getCurrentUser(),
  });
}

export function useCheckIns() {
  return useQuery({
    queryKey: queryKeys.checkIns,
    queryFn: () => checkInService.list(),
  });
}

export function useCheckInByDate(date: IsoDate) {
  return useQuery({
    queryKey: queryKeys.checkIn(date),
    queryFn: () => checkInService.getByDate(date),
  });
}

export function useCycles() {
  return useQuery({
    queryKey: queryKeys.cycles,
    queryFn: () => cycleService.listCycles(),
  });
}

export function usePeriods() {
  return useQuery({
    queryKey: queryKeys.periods,
    queryFn: () => cycleService.listPeriods(),
  });
}

export function useTreatments() {
  return useQuery({
    queryKey: queryKeys.treatments,
    queryFn: () => treatmentService.list(),
  });
}

export function useInsights() {
  return useQuery({
    queryKey: queryKeys.insights,
    queryFn: () => insightService.list(),
  });
}

export function useAppointmentSummary() {
  return useQuery({
    queryKey: queryKeys.appointmentSummary,
    queryFn: () => appointmentService.getLatestSummary(),
  });
}

export function useArticles() {
  return useQuery({
    queryKey: queryKeys.articles,
    queryFn: () => articleService.list(),
  });
}

export function useArticle(slug: string) {
  return useQuery({
    queryKey: queryKeys.article(slug),
    queryFn: () => articleService.getBySlug(slug),
  });
}
