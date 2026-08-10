/**
 * TanStack Query hooks + mutations. Components use these rather than calling
 * services/repositories directly, so caching, loading, error states and cache
 * invalidation are handled consistently.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DATA_QUERY_KEYS,
  analysisService,
  aiService,
  accountService,
  appLockService,
  appointmentService,
  appointmentRecordService,
  articleService,
  checkInService,
  cycleService,
  entitlementService,
  healthService,
  howChangedService,
  insightService,
  notificationService,
  queryKeys,
  reflectionService,
  shareService,
  sinceService,
  symptomService,
  timelineService,
  treatmentService,
  userService,
} from '@/services';
import {
  checkInRepository,
  cycleRepository,
  preferencesRepository,
  privacyRepository,
  symptomRepository,
  treatmentRepository,
} from '@/services/repositories';
import { enterDemoMode, exitDemoMode, resetDemo } from '@/services/demo';
import { deleteAllData } from '@/services/dataManagement';
import { useAppModeStore } from '@/store/appModeStore';
import type {
  AppointmentRecord,
  Capability,
  ConsentType,
  DailyCheckIn,
  HealthMetricKind,
  InsightFeedbackValue,
  PeriodEntry,
  ShareAudience,
  ShareSection,
  SymptomPrivacy,
  Tier,
  TimelineFilter,
  TrackingConfig,
  TreatmentEvent,
  UserPreferences,
  UserProfile,
} from '@/domain/models';
import type { IsoDate } from '@/lib/date';

// --- queries ---------------------------------------------------------------

export function useCurrentUser() {
  return useQuery({ queryKey: queryKeys.currentUser, queryFn: () => userService.getCurrentUser() });
}

export function useAllSymptoms() {
  return useQuery({ queryKey: ['symptoms'], queryFn: () => symptomService.allSymptoms() });
}

export function useCheckIns() {
  return useQuery({ queryKey: queryKeys.checkIns, queryFn: () => checkInService.list() });
}

export function useCheckInByDate(date: IsoDate) {
  return useQuery({ queryKey: queryKeys.checkIn(date), queryFn: () => checkInService.getByDate(date) });
}

export function usePeriods() {
  return useQuery({ queryKey: queryKeys.periods, queryFn: () => cycleService.listPeriods() });
}

export function useCycleStats() {
  return useQuery({ queryKey: queryKeys.cycles, queryFn: () => cycleService.stats() });
}

export function useTreatments() {
  return useQuery({ queryKey: queryKeys.treatments, queryFn: () => treatmentService.list() });
}

export function useInsights() {
  return useQuery({ queryKey: queryKeys.insights, queryFn: () => insightService.list() });
}

export function useAnalysis() {
  return useQuery({ queryKey: queryKeys.analysis, queryFn: () => analysisService.snapshot() });
}

export function useAppointmentSummary() {
  return useQuery({
    queryKey: queryKeys.appointmentSummary,
    queryFn: () => appointmentService.build(new Date().toISOString()),
  });
}

export function useArticles() {
  return useQuery({ queryKey: queryKeys.articles, queryFn: () => articleService.list() });
}

export function useArticle(slug: string) {
  return useQuery({ queryKey: queryKeys.article(slug), queryFn: () => articleService.getBySlug(slug) });
}

// --- invalidation helper ---------------------------------------------------

function useInvalidateData() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of DATA_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['symptoms'] });
    queryClient.invalidateQueries({ queryKey: ['since'] });
    queryClient.invalidateQueries({ queryKey: ['reflection'] });
    queryClient.invalidateQueries({ queryKey: ['symptomPrivacy'] });
    queryClient.invalidateQueries({ queryKey: ['aiSummary'] });
  };
}

// --- mutations -------------------------------------------------------------

export function useSaveCheckIn() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (checkIn: DailyCheckIn) => checkInRepository.upsert(checkIn),
    onSuccess: invalidate,
  });
}

export function useDeleteCheckIn() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (date: IsoDate) => checkInRepository.removeByDate(date),
    onSuccess: invalidate,
  });
}

export function useUpsertPeriod() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (entry: PeriodEntry) => cycleRepository.upsertPeriod(entry),
    onSuccess: invalidate,
  });
}

export function useRemovePeriod() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (date: IsoDate) => cycleRepository.removeByDate(date),
    onSuccess: invalidate,
  });
}

export function useUpsertTreatment() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (event: TreatmentEvent) => treatmentRepository.upsert(event),
    onSuccess: invalidate,
  });
}

export function useRemoveTreatment() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (id: string) => treatmentRepository.remove(id),
    onSuccess: invalidate,
  });
}

export function useSetTrackingConfig() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (config: TrackingConfig) => symptomRepository.setConfig(config),
    onSuccess: invalidate,
  });
}

export function useSetPreferences() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (prefs: UserPreferences) => preferencesRepository.setPreferences(prefs),
    onSuccess: invalidate,
  });
}

export function useSetProfile() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (profile: UserProfile) => preferencesRepository.setProfile(profile),
    onSuccess: invalidate,
  });
}

export function useSetAppointmentQuestions() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (questions: string[]) => preferencesRepository.setQuestions(questions),
    onSuccess: invalidate,
  });
}

export function useCompleteOnboarding() {
  const invalidate = useInvalidateData();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      reasons: import('@/domain/models').OnboardingReason[];
      pinnedIds: string[];
      customSymptoms?: import('@/domain/models').Symptom[];
    }) => {
      for (const custom of input.customSymptoms ?? []) symptomRepository.addCustomSymptom(custom);
      symptomRepository.setPinned(input.pinnedIds);
      preferencesRepository.setOnboarding(input.reasons);
    },
    onSuccess: () => {
      // Update the user cache synchronously so the route guard sees the
      // onboarded state immediately (avoids a redirect race on navigate).
      queryClient.setQueryData(queryKeys.currentUser, userService.getCurrentUser());
      invalidate();
    },
  });
}

export function useDeleteAllData() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async () => deleteAllData(),
    onSuccess: invalidate,
  });
}

// --- data mode (real vs demo) ----------------------------------------------

export function useDataMode() {
  const invalidate = useInvalidateData();
  const mode = useAppModeStore((s) => s.mode);
  const setModeState = useAppModeStore((s) => s.setModeState);
  return {
    mode,
    enterDemo: () => {
      enterDemoMode();
      setModeState('demo');
      invalidate();
    },
    exitDemo: () => {
      exitDemoMode();
      setModeState('real');
      invalidate();
    },
    resetDemo: () => {
      resetDemo();
      invalidate();
    },
  };
}

// --- Phase 2 queries -------------------------------------------------------

export function useHomeInsights() {
  return useQuery({ queryKey: queryKeys.homeInsights, queryFn: () => insightService.homeList() });
}

export function useSymptomPrivacyMap() {
  return useQuery({ queryKey: ['symptomPrivacy'], queryFn: () => privacyRepository.getAll() });
}

export function useHealthCapabilities() {
  return useQuery({ queryKey: [...queryKeys.health, 'capabilities'], queryFn: () => healthService.capabilities() });
}

export function useHealthPermissions() {
  return useQuery({ queryKey: [...queryKeys.health, 'permissions'], queryFn: () => healthService.permissions() });
}

export function useLatestHealthSample() {
  return useQuery({ queryKey: [...queryKeys.health, 'latest'], queryFn: () => healthService.latestSample() });
}

export function useDueNotifications() {
  return useQuery({ queryKey: queryKeys.notifications, queryFn: () => notificationService.due() });
}

export function useSince(anchorDate: IsoDate | null, anchorLabel: string) {
  return useQuery({
    queryKey: ['since', anchorDate, anchorLabel],
    queryFn: () => (anchorDate ? sinceService.build(anchorDate, anchorLabel) : null),
    enabled: anchorDate !== null,
  });
}

export function useReflection(month: string) {
  return useQuery({ queryKey: queryKeys.reflection(month), queryFn: () => reflectionService.build(month) });
}

export function useAISummary() {
  const user = useCurrentUser();
  const aiOn = Boolean(user.data?.preferences.ai?.enabled && user.data?.preferences.ai?.consentedAt);
  return useQuery({
    queryKey: ['aiSummary', aiOn],
    queryFn: () => aiService.summariseInsights(),
  });
}

// --- Phase 2 mutations -----------------------------------------------------

export function useConnectHealth() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (kinds: HealthMetricKind[]) => healthService.connect(kinds),
    onSuccess: invalidate,
  });
}

export function useDisconnectHealth() {
  const invalidate = useInvalidateData();
  return useMutation({ mutationFn: async () => healthService.disconnect(), onSuccess: invalidate });
}

export function useSetSymptomPrivacy() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (input: { symptomId: string; privacy: SymptomPrivacy }) =>
      privacyRepository.set(input.symptomId, input.privacy),
    onSuccess: invalidate,
  });
}

export function useSetInsightFeedback() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (input: { insightKey: string; value: InsightFeedbackValue }) =>
      insightService.setFeedback(input.insightKey, input.value),
    onSuccess: invalidate,
  });
}

// --- Phase 3: accounts, sync, timeline, sharing, entitlements --------------

export function useTimeline(filter: TimelineFilter = 'all') {
  return useQuery({ queryKey: [...queryKeys.timeline, filter], queryFn: () => timelineService.grouped(filter) });
}

export function useHowChanged() {
  return useQuery({ queryKey: queryKeys.howChanged, queryFn: () => howChangedService.build() });
}

export function useAddMilestone() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (input: { date: IsoDate; title: string; detail?: string }) =>
      timelineService.addMilestone(input),
    onSuccess: invalidate,
  });
}

export function useAccount() {
  return useQuery({ queryKey: queryKeys.account, queryFn: () => accountService.current() });
}

export function useDeviceSessions() {
  return useQuery({ queryKey: queryKeys.sessions, queryFn: () => accountService.sessions() });
}

export function useEntitlement() {
  return useQuery({ queryKey: queryKeys.entitlement, queryFn: () => entitlementService.entitlement() });
}

export function useCapability(capability: Capability) {
  return useQuery({
    queryKey: [...queryKeys.entitlement, capability],
    queryFn: () => entitlementService.can(capability),
  });
}

export function useConsents() {
  return useQuery({ queryKey: queryKeys.consents, queryFn: () => accountService.consents() });
}

function useInvalidateAccount() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [queryKeys.account, queryKeys.sessions, queryKeys.consents, queryKeys.entitlement]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useCreateAccount() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async (input: { email?: string; displayName?: string }) => accountService.createAccount(input),
    onSuccess: invalidate,
  });
}

export function useSignOut() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async (options: { wipeLocal?: boolean } = {}) => accountService.signOut(options),
    onSuccess: invalidate,
  });
}

export function useSyncNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => accountService.syncNow(),
    onSuccess: () => {
      for (const key of DATA_QUERY_KEYS) queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useRevokeSession() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async (id: string) => accountService.revokeSession(id),
    onSuccess: invalidate,
  });
}

export function useSetConsent() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async (input: { type: ConsentType; granted: boolean }) =>
      input.granted ? accountService.recordConsent(input.type) : accountService.withdrawConsent(input.type),
    onSuccess: invalidate,
  });
}

export function useSetTier() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async (tier: Tier) => entitlementService.setTier(tier),
    onSuccess: invalidate,
  });
}

export function useAppLock() {
  return useQuery({ queryKey: queryKeys.appLock, queryFn: () => appLockService.isEnabled() });
}

export function useSetAppLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (on: boolean) => appLockService.setEnabled(on),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.appLock }),
  });
}

// Appointments (records)
export function useAppointments() {
  return useQuery({ queryKey: queryKeys.appointments, queryFn: () => appointmentRecordService.list() });
}

export function useAppointment(id: string) {
  return useQuery({ queryKey: queryKeys.appointment(id), queryFn: () => appointmentRecordService.get(id) });
}

export function useSaveAppointment() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (input: Partial<AppointmentRecord> & { date: IsoDate }) =>
      appointmentRecordService.save(input),
    onSuccess: invalidate,
  });
}

export function useDeleteAppointment() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (id: string) => appointmentRecordService.remove(id),
    onSuccess: invalidate,
  });
}

// Sharing
export function useShareLinks() {
  return useQuery({ queryKey: queryKeys.shareLinks, queryFn: () => shareService.links() });
}

export function useCreateShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      audience: ShareAudience;
      sections: ShareSection[];
      includedSymptomIds: string[];
      expiryDays: number;
      partnerNote?: string;
    }) => shareService.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.shareLinks }),
  });
}

export function useRevokeShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => shareService.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.shareLinks }),
  });
}
