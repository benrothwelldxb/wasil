import { config } from '../config'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import type {
  User,
  Message,
  Form,
  FormWithResponses,
  FormField,
  FormType,
  FormStatus,
  FormResponseData,
  FormAnalytics,
  Event,
  ScheduleItem,
  TermDate,
  WeeklyMessage,
  KnowledgeCategory,
  PulseSurvey,
  PulseAnalytics,
  PulseOptionalQuestion,
  Class,
  EventRsvpStatus,
  School,
  YearGroup,
  AuditLogListResponse,
  NotificationListResponse,
  DeviceTokenPlatform,
  ParentInvitation,
  ParentInvitationListResponse,
  InvitationValidationResponse,
  InvitationRedeemResponse,
  BulkInvitationResult,
  InvitationStatus,
  Student,
  StudentListResponse,
  StudentSearchResult,
  BulkStudentResult,
  ExternalLink,
  LinkCategory,
  LinksResponse,
  LinksAllResponse,
  Group,
  GroupCategory,
  GroupMember,
  GroupStaffAssignment,
  GroupMemberListResponse,
  ParentGroupInfo,
  EcaSettings,
  EcaTerm,
  EcaTermWithActivities,
  EcaActivity,
  EcaAllocationPreview,
  EcaAllocationResult,
  ParentEcaTerm,
  ParentEcaSelections,
  ParentEcaAllocations,
  EcaSelectionSubmission,
  EcaAttendanceSession,
  EcaAttendanceMarkRequest,
  EcaTermStatus,
  EcaSelectionMode,
  EcaTimeSlot,
  EcaActivityType,
  EcaGender,
  EcaAttendanceStatus,
  EcaAllocationSuggestion,
  EcaSuggestionStatus,
  ConsultationEvent,
  ConsultationTeacher,
  ConsultationBooking,
  ConsultationStatus,
  AnalyticsOverview,
  AnalyticsMessagesResponse,
  EngagementTrendResponse,
  EcaStatsResponse,
  EmergencyAlert,
  EmergencyAlertCreateData,
  SchoolService,
  SchoolServiceWithStats,
  ServiceRegistration,
  ServiceRegistrationCreate,
  ServiceStatus,
  RegistrationStatus,
  PaymentStatus,
} from '../types'

const API_URL = config.apiUrl

// Token storage abstraction: uses Capacitor Preferences on native, localStorage in browser
const isNative = (() => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
})()

async function persistRefreshToken(token: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key: 'refreshToken', value: token })
  } else {
    localStorage.setItem('refreshToken', token)
  }
}

async function removePersistedRefreshToken(): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key: 'refreshToken' })
  } else {
    localStorage.removeItem('refreshToken')
  }
}

async function loadPersistedRefreshToken(): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key: 'refreshToken' })
    return value
  } else {
    return localStorage.getItem('refreshToken')
  }
}

// Token state (in-memory cache for synchronous reads, write-through to secure storage)
let accessToken: string | null = null
let refreshTokenValue: string | null = null
let _tokenStorageReady = false

// Initialize tokens from secure storage. Must be called (and awaited) at app startup
// before any authenticated API calls. AuthContext already has an async init phase.
export async function initTokenStorage(): Promise<void> {
  refreshTokenValue = await loadPersistedRefreshToken()
  _tokenStorageReady = true
}

// Synchronous fallback for non-native: pre-populate from localStorage immediately
// so code that runs before initTokenStorage still works in the browser.
if (!isNative) {
  refreshTokenValue = localStorage.getItem('refreshToken')
  _tokenStorageReady = true
}

export function setTokens(access: string, refresh: string) {
  accessToken = access
  refreshTokenValue = refresh
  // Write-through to persistent storage (fire-and-forget; errors are non-fatal)
  persistRefreshToken(refresh).catch(() => {})
}

export function clearTokens() {
  accessToken = null
  refreshTokenValue = null
  removePersistedRefreshToken().catch(() => {})
}

export function getRefreshToken(): string | null {
  return refreshTokenValue
}

export function getAccessToken(): string | null {
  return accessToken
}

let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!refreshTokenValue) return false
  if (isRefreshing && refreshPromise) return refreshPromise

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      })

      if (!response.ok) {
        clearTokens()
        return false
      }

      const data = await response.json()
      setTokens(data.accessToken, data.refreshToken)
      return true
    } catch {
      clearTokens()
      return false
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const headers: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  let response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  })

  // On 401, try refresh and retry once
  if (response.status === 401 && refreshTokenValue) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      const retryHeaders: Record<string, string> = isFormData
        ? {}
        : { 'Content-Type': 'application/json' }
      if (accessToken) {
        retryHeaders['Authorization'] = `Bearer ${accessToken}`
      }

      response = await fetch(`${API_URL}${url}`, {
        ...options,
        headers: {
          ...retryHeaders,
          ...options?.headers,
        },
      })
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    // Enrich rate limit errors with retry info
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      const minutes = retryAfter ? Math.ceil(parseInt(retryAfter) / 60) : 15
      throw new Error(error.error || `Too many attempts. Please try again in ${minutes} minutes.`)
    }
    throw new Error(error.error || `Request failed (${response.status})`)
  }

  return response.json()
}

// 2FA error class
export class TwoFactorRequiredError extends Error {
  twoFactorSessionToken: string
  constructor(sessionToken: string) {
    super('Two-factor authentication required')
    this.name = 'TwoFactorRequiredError'
    this.twoFactorSessionToken = sessionToken
  }
}

// Auth
export const auth = {
  me: () => fetchApi<User>('/auth/me'),
  login: async (email: string, password: string) => {
    const result = await fetchApi<{ user?: User; accessToken?: string; refreshToken?: string; twoFactorRequired?: boolean; twoFactorSessionToken?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    if (result.twoFactorRequired && result.twoFactorSessionToken) {
      throw new TwoFactorRequiredError(result.twoFactorSessionToken)
    }

    if (result.accessToken && result.refreshToken) {
      setTokens(result.accessToken, result.refreshToken)
    }
    return result.user!
  },
  verify2fa: async (sessionToken: string, code: string) => {
    const result = await fetchApi<{ user: User; accessToken: string; refreshToken: string }>('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ sessionToken, code }),
    })
    setTokens(result.accessToken, result.refreshToken)
    return result.user
  },
  recover2fa: async (sessionToken: string, code: string) => {
    const result = await fetchApi<{ user: User; accessToken: string; refreshToken: string; recoveryCodesRemaining?: number }>('/auth/2fa/recover', {
      method: 'POST',
      body: JSON.stringify({ sessionToken, code }),
    })
    setTokens(result.accessToken, result.refreshToken)
    return { user: result.user, recoveryCodesRemaining: result.recoveryCodesRemaining }
  },
  setup2fa: () =>
    fetchApi<{ qrCode: string; secret: string; recoveryCodes: string[] }>('/auth/2fa/setup', {
      method: 'POST',
    }),
  confirmSetup2fa: (code: string) =>
    fetchApi<{ success: boolean }>('/auth/2fa/confirm-setup', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  disable2fa: (code: string) =>
    fetchApi<{ success: boolean }>('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  get2faStatus: () =>
    fetchApi<{ enabled: boolean; setupAt: string | null }>('/auth/2fa/status'),
  demoLogin: async (email: string, role?: string) => {
    const result = await fetchApi<{ user: User; accessToken: string; refreshToken: string }>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    })
    setTokens(result.accessToken, result.refreshToken)
    return result.user
  },
  logout: async () => {
    const token = refreshTokenValue
    clearTokens()
    await fetchApi<{ message: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => {})
  },
  refreshToken: async (): Promise<boolean> => {
    return tryRefresh()
  },
}

// Messages
export const messages = {
  list: () => fetchApi<Message[]>('/api/messages'),
  listAll: () => fetchApi<Message[]>('/api/messages/all'),
  uploadAttachment: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchApi<{ fileName: string; fileUrl: string; fileType: string; fileSize: number }>('/api/messages/upload', {
      method: 'POST',
      body: formData,
    })
  },
  create: (data: {
    title: string
    content: string
    targetClass: string
    classId?: string
    yearGroupId?: string
    groupId?: string
    actionType?: string
    actionLabel?: string
    actionDueDate?: string
    actionAmount?: string
    isPinned?: boolean
    isUrgent?: boolean
    expiresAt?: string
    formId?: string
    attachments?: { fileName: string; fileUrl: string; fileType: string; fileSize: number }[]
  }) =>
    fetchApi<Message>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: {
    title: string
    content: string
    targetClass: string
    classId?: string
    yearGroupId?: string
    groupId?: string
    actionType?: string
    actionLabel?: string
    actionDueDate?: string
    actionAmount?: string
    isPinned?: boolean
    isUrgent?: boolean
    expiresAt?: string
    formId?: string
    attachments?: { fileName: string; fileUrl: string; fileType: string; fileSize: number }[]
  }) =>
    fetchApi<Message>(`/api/messages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/messages/${id}`, {
      method: 'DELETE',
    }),
  acknowledge: (id: string) =>
    fetchApi<{ id: string; messageId: string }>(`/api/messages/${id}/ack`, {
      method: 'POST',
    }),
}


// Forms
export const forms = {
  list: () => fetchApi<Form[]>('/api/forms'),
  listAll: () => fetchApi<FormWithResponses[]>('/api/forms/all'),
  listAvailable: () => fetchApi<Form[]>('/api/forms/available'),
  getTemplates: () => fetchApi<{ message: string }>('/api/forms/templates'),
  create: (data: {
    title: string
    description?: string
    type: FormType
    status?: FormStatus
    fields: FormField[]
    targetClass: string
    classIds?: string[]
    yearGroupIds?: string[]
    expiresAt?: string
  }) =>
    fetchApi<Form>('/api/forms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: {
    title?: string
    description?: string
    type?: FormType
    status?: FormStatus
    fields?: FormField[]
    targetClass?: string
    classIds?: string[]
    yearGroupIds?: string[]
    expiresAt?: string
  }) =>
    fetchApi<Form>(`/api/forms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/forms/${id}`, {
      method: 'DELETE',
    }),
  respond: (id: string, answers: Record<string, unknown>) =>
    fetchApi<FormResponseData>(`/api/forms/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
  close: (id: string) =>
    fetchApi<{ id: string; status: string }>(`/api/forms/${id}/close`, {
      method: 'PATCH',
    }),
  exportCSV: (id: string, title: string) =>
    downloadCSV(`/api/forms/${id}/export`, `${title.replace(/[^a-zA-Z0-9]/g, '_')}_responses.csv`),
  // Public export link management
  getExportToken: (id: string) =>
    fetchApi<{ hasExportToken: boolean; exportToken: string | null }>(`/api/forms/${id}/export-token`),
  generateExportToken: (id: string) =>
    fetchApi<{ exportToken: string; message: string }>(`/api/forms/${id}/export-token`, {
      method: 'POST',
    }),
  deleteExportToken: (id: string) =>
    fetchApi<{ message: string }>(`/api/forms/${id}/export-token`, {
      method: 'DELETE',
    }),
  getAnalytics: (id: string) =>
    fetchApi<FormAnalytics>(`/api/forms/${id}/analytics`),
}

// Events
export const events = {
  list: () => fetchApi<Event[]>('/api/events'),
  listAll: () => fetchApi<Event[]>('/api/events/all'),
  create: (data: {
    title: string
    description?: string
    date: string
    time?: string
    location?: string
    targetClass: string
    classId?: string
    yearGroupId?: string
    groupId?: string
    requiresRsvp?: boolean
  }) =>
    fetchApi<Event>('/api/events', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: {
    title: string
    description?: string
    date: string
    time?: string
    location?: string
    targetClass: string
    classId?: string
    yearGroupId?: string
    groupId?: string
    requiresRsvp?: boolean
  }) =>
    fetchApi<Event>(`/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  rsvp: (id: string, status: EventRsvpStatus) =>
    fetchApi<{ id: string }>(`/api/events/${id}/rsvp`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/events/${id}`, {
      method: 'DELETE',
    }),
  exportCalendar: () =>
    downloadFile('/api/events/calendar.ics', 'school-events.ics'),
  exportEventCalendar: (id: string, title: string) =>
    downloadFile(`/api/events/${id}/calendar.ics`, `${title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`),
}

// Schedule
export const schedule = {
  list: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams()
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchApi<ScheduleItem[]>(`/api/schedule${query}`)
  },
  listAll: () => fetchApi<ScheduleItem[]>('/api/schedule/all'),
  create: (data: {
    targetClass: string
    classId?: string
    yearGroupId?: string
    isRecurring?: boolean
    dayOfWeek?: number
    date?: string
    type: string
    label: string
    description?: string
    icon?: string
  }) =>
    fetchApi<ScheduleItem>('/api/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ScheduleItem>) =>
    fetchApi<ScheduleItem>(`/api/schedule/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/schedule/${id}`, {
      method: 'DELETE',
    }),
}

// Term Dates
export const termDates = {
  list: () => fetchApi<TermDate[]>('/api/term-dates'),
  create: (data: {
    term: number
    termName: string
    label: string
    sublabel?: string
    date: string
    endDate?: string
    type: string
    color: string
  }) =>
    fetchApi<TermDate>('/api/term-dates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<TermDate>) =>
    fetchApi<TermDate>(`/api/term-dates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/term-dates/${id}`, {
      method: 'DELETE',
    }),
  seed: () =>
    fetchApi<{ message: string; count: number }>('/api/term-dates/seed', {
      method: 'POST',
    }),
  exportCalendar: () =>
    downloadFile('/api/term-dates/calendar.ics', 'term-dates.ics'),
}

// Weekly Message
export const weeklyMessage = {
  getCurrent: () => fetchApi<WeeklyMessage | null>('/api/weekly-message/current'),
  list: () => fetchApi<WeeklyMessage[]>('/api/weekly-message'),
  create: (data: {
    title: string
    content: string
    weekOf: string
    isCurrent?: boolean
    imageUrl?: string
    scheduledAt?: string
  }) =>
    fetchApi<WeeklyMessage>('/api/weekly-message', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<WeeklyMessage>) =>
    fetchApi<WeeklyMessage>(`/api/weekly-message/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/weekly-message/${id}`, {
      method: 'DELETE',
    }),
  toggleHeart: (id: string) =>
    fetchApi<{ hearted: boolean }>(`/api/weekly-message/${id}/heart`, {
      method: 'POST',
    }),
}

// Knowledge Base
export const knowledge = {
  list: () => fetchApi<KnowledgeCategory[]>('/api/knowledge'),
  createCategory: (data: {
    name: string
    icon: string
    color: string
    order?: number
  }) =>
    fetchApi<KnowledgeCategory>('/api/knowledge/category', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: string, data: Partial<KnowledgeCategory>) =>
    fetchApi<KnowledgeCategory>(`/api/knowledge/category/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: string) =>
    fetchApi<{ message: string }>(`/api/knowledge/category/${id}`, {
      method: 'DELETE',
    }),
  createArticle: (data: { title: string; content: string; categoryId: string }) =>
    fetchApi<{ id: string }>('/api/knowledge/article', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateArticle: (id: string, data: { title?: string; content?: string }) =>
    fetchApi<{ id: string }>(`/api/knowledge/article/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteArticle: (id: string) =>
    fetchApi<{ message: string }>(`/api/knowledge/article/${id}`, {
      method: 'DELETE',
    }),
}

// Helper to download a file with auth (generic)
async function downloadFile(url: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {}
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_URL}${url}`, { headers })

  if (response.status === 401 && refreshTokenValue) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`
      const retryResponse = await fetch(`${API_URL}${url}`, { headers })
      if (!retryResponse.ok) throw new Error('Download failed')
      const blob = await retryResponse.blob()
      triggerDownload(blob, filename)
      return
    }
  }

  if (!response.ok) throw new Error('Download failed')
  const blob = await response.blob()
  triggerDownload(blob, filename)
}

// Helper to download CSV with auth
async function downloadCSV(url: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {}
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_URL}${url}`, { headers })

  if (response.status === 401 && refreshTokenValue) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`
      const retryResponse = await fetch(`${API_URL}${url}`, { headers })
      if (!retryResponse.ok) throw new Error('Export failed')
      const blob = await retryResponse.blob()
      triggerDownload(blob, filename)
      return
    }
  }

  if (!response.ok) throw new Error('Export failed')
  const blob = await response.blob()
  triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

// Pulse Surveys
export const pulse = {
  list: () => fetchApi<PulseSurvey[]>('/api/pulse'),
  listAll: () => fetchApi<PulseSurvey[]>('/api/pulse/all'),
  get: (id: string) => fetchApi<PulseSurvey>(`/api/pulse/${id}`),
  analytics: (id: string) => fetchApi<PulseAnalytics>(`/api/pulse/${id}/analytics`),
  optionalQuestions: () => fetchApi<PulseOptionalQuestion[]>('/api/pulse/optional-questions'),
  exportCSV: (id: string, halfTermName: string) =>
    downloadCSV(`/api/pulse/${id}/export`, `pulse_${halfTermName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`),
  comparison: () =>
    fetchApi<{ comparison: import('../types').PulseComparison[] }>('/api/pulse/comparison'),
  create: (data: {
    halfTermName: string
    status?: string
    opensAt: string
    closesAt: string
    additionalQuestionKey?: string | null
    customQuestions?: Array<{ id: string; text: string; type: 'LIKERT_5' | 'TEXT_OPTIONAL' }>
  }) =>
    fetchApi<PulseSurvey>('/api/pulse', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: {
    halfTermName: string
    opensAt: string
    closesAt: string
    additionalQuestionKey?: string | null
    customQuestions?: Array<{ id: string; text: string; type: 'LIKERT_5' | 'TEXT_OPTIONAL' }>
  }) =>
    fetchApi<PulseSurvey>(`/api/pulse/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/pulse/${id}`, {
      method: 'DELETE',
    }),
  respond: (id: string, answers: Record<string, number | string>) =>
    fetchApi<{ id: string }>(`/api/pulse/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
  send: (id: string) =>
    fetchApi<{ id: string }>(`/api/pulse/${id}/send`, {
      method: 'POST',
    }),
  close: (id: string) =>
    fetchApi<{ id: string }>(`/api/pulse/${id}/close`, {
      method: 'POST',
    }),
}

// Users
export const users = {
  list: () => fetchApi<User[]>('/api/users'),
  create: (data: {
    email: string
    name: string
    role?: string
    children?: Array<{ name: string; classId: string }>
  }) =>
    fetchApi<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<User>) =>
    fetchApi<User>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/users/${id}`, {
      method: 'DELETE',
    }),
  languages: () => fetchApi<Array<{ code: string; name: string }>>('/api/users/languages'),
  updateLanguage: (language: string) =>
    fetchApi<{ language: string }>('/api/users/me/language', {
      method: 'PATCH',
      body: JSON.stringify({ language }),
    }),
}

// Classes
export interface ClassWithDetails extends Class {
  studentCount: number
  assignedStaff: Array<{ id: string; name: string; role: string }>
  yearGroupId?: string
  yearGroup?: { id: string; name: string; order: number } | null
}

export const classes = {
  list: () => fetchApi<Class[]>('/api/classes'),
  listAll: () => fetchApi<ClassWithDetails[]>('/api/classes/all'),
  create: (data: { name: string; colorBg?: string; colorText?: string; staffIds?: string[]; yearGroupId?: string }) =>
    fetchApi<ClassWithDetails>('/api/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; colorBg?: string; colorText?: string; staffIds?: string[]; yearGroupId?: string }) =>
    fetchApi<ClassWithDetails>(`/api/classes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/classes/${id}`, {
      method: 'DELETE',
    }),
}

// Year Groups
export const yearGroups = {
  list: () => fetchApi<YearGroup[]>('/api/year-groups'),
  create: (data: { name: string; order: number }) =>
    fetchApi<YearGroup>('/api/year-groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name: string; order: number }) =>
    fetchApi<YearGroup>(`/api/year-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/year-groups/${id}`, {
      method: 'DELETE',
    }),
  reorder: (ids: string[]) =>
    fetchApi<{ message: string }>('/api/year-groups/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
}

// Policies
export interface Policy {
  id: string
  name: string
  description: string | null
  fileUrl: string
  fileSize: number | null
  updatedAt: string
}

export const policies = {
  list: () => fetchApi<Policy[]>('/api/policies'),
  create: (data: FormData) =>
    fetchApi<Policy>('/api/policies', {
      method: 'POST',
      body: data,
    }),
  update: (id: string, data: FormData) =>
    fetchApi<Policy>(`/api/policies/${id}`, {
      method: 'PUT',
      body: data,
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/policies/${id}`, {
      method: 'DELETE',
    }),
}

// Files
export const files = {
  list: () => fetchApi<any>('/api/files'),
  getFolder: (id: string) => fetchApi<any>(`/api/files/folder/${id}`),
  search: (query: string) => fetchApi<any>(`/api/files/search?q=${encodeURIComponent(query)}`),
  createFolder: (data: { name: string; icon?: string; color?: string; parentId?: string }) =>
    fetchApi<any>('/api/files/folder', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createFile: (data: { name: string; fileName: string; fileUrl: string; fileType: string; fileSize: number; folderId?: string }) =>
    fetchApi<any>('/api/files/file', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteFile: (id: string) =>
    fetchApi<{ message: string }>(`/api/files/file/${id}`, {
      method: 'DELETE',
    }),
  deleteFolder: (id: string) =>
    fetchApi<{ message: string }>(`/api/files/folder/${id}`, {
      method: 'DELETE',
    }),
}

// Staff Management
export interface StaffMember {
  id: string
  email: string
  name: string
  role: 'STAFF' | 'ADMIN'
  position?: string | null
  avatarUrl?: string
  hasPassword?: boolean
  twoFactorEnabled?: boolean
  lastLoginAt?: string | null
  assignedClasses: Array<{ id: string; name: string }>
  createdAt: string
}

export interface BulkStaffResult {
  created: number
  skipped: number
  errors?: string[]
  staff: Array<{ id: string; email: string; name: string; role: string }>
}

export const staff = {
  list: () => fetchApi<StaffMember[]>('/api/staff'),
  create: (data: {
    email: string
    name: string
    role: 'STAFF' | 'ADMIN'
    assignedClassIds?: string[]
  }) =>
    fetchApi<StaffMember>('/api/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  bulkCreate: (staff: Array<{ name: string; email: string; role: 'STAFF' | 'ADMIN' }>) =>
    fetchApi<BulkStaffResult>('/api/staff/bulk', {
      method: 'POST',
      body: JSON.stringify({ staff }),
    }),
  update: (id: string, data: {
    email?: string
    name?: string
    role?: 'STAFF' | 'ADMIN'
    assignedClassIds?: string[]
  }) =>
    fetchApi<StaffMember>(`/api/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/staff/${id}`, {
      method: 'DELETE',
    }),
  sendLogin: (id: string) =>
    fetchApi<{ message: string }>(`/api/staff/${id}/send-login`, {
      method: 'POST',
    }),
  reset2fa: (id: string) =>
    fetchApi<{ message: string }>(`/api/staff/${id}/reset-2fa`, {
      method: 'POST',
    }),
}

// Schools (Super Admin)
import type { SchoolWithCount, SchoolStats, SystemStats, SchoolUser, CreateSchoolData, CreateAdminData, CreateAdminResponse } from '../types'

export const schools = {
  list: (includeArchived = false) =>
    fetchApi<SchoolWithCount[]>(`/api/schools${includeArchived ? '?includeArchived=true' : ''}`),
  get: (id: string) => fetchApi<SchoolWithCount>(`/api/schools/${id}`),
  create: (data: CreateSchoolData) =>
    fetchApi<School>('/api/schools', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateBranding: (id: string, data: Partial<School>) =>
    fetchApi<School>(`/api/schools/${id}/branding`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  archive: (id: string) =>
    fetchApi<{ success: boolean; message: string }>(`/api/schools/${id}`, {
      method: 'DELETE',
    }),
  getStats: (id: string) => fetchApi<SchoolStats>(`/api/schools/${id}/stats`),
  getSystemStats: () => fetchApi<SystemStats>('/api/schools/system-stats'),
  getUsers: (id: string, role?: string) =>
    fetchApi<SchoolUser[]>(`/api/schools/${id}/users${role ? `?role=${role}` : ''}`),
  createAdmin: (id: string, data: CreateAdminData) =>
    fetchApi<CreateAdminResponse>(`/api/schools/${id}/admins`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  removeUser: (schoolId: string, userId: string) =>
    fetchApi<{ success: boolean; message: string }>(`/api/schools/${schoolId}/users/${userId}`, {
      method: 'DELETE',
    }),
}

// Audit Logs
export const auditLogs = {
  list: (params?: {
    action?: string
    resourceType?: string
    userId?: string
    startDate?: string
    endDate?: string
    page?: number
    limit?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.action) searchParams.append('action', params.action)
    if (params?.resourceType) searchParams.append('resourceType', params.resourceType)
    if (params?.userId) searchParams.append('userId', params.userId)
    if (params?.startDate) searchParams.append('startDate', params.startDate)
    if (params?.endDate) searchParams.append('endDate', params.endDate)
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    const query = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return fetchApi<AuditLogListResponse>(`/api/audit-logs${query}`)
  },
}

// Notifications
export const notifications = {
  list: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    const query = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return fetchApi<NotificationListResponse>(`/api/notifications${query}`)
  },
  unreadCount: () => fetchApi<{ count: number }>('/api/notifications/unread-count'),
  markRead: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/notifications/${id}/read`, {
      method: 'PATCH',
    }),
  markAllRead: () =>
    fetchApi<{ success: boolean }>('/api/notifications/read-all', {
      method: 'POST',
    }),
  getPreferences: () =>
    fetchApi<import('../types').NotificationPreferences>('/api/notifications/preferences'),
  updatePreferences: (data: Partial<import('../types').NotificationPreferences>) =>
    fetchApi<import('../types').NotificationPreferences>('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}

// Device Tokens
export const deviceTokens = {
  register: (data: { token: string; platform: DeviceTokenPlatform }) =>
    fetchApi<{ success: boolean }>('/api/device-tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  remove: (token: string) =>
    fetchApi<{ success: boolean }>('/api/device-tokens', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    }),
}

// Parent Invitations
export const parentInvitations = {
  // Admin endpoints
  list: (params?: {
    status?: InvitationStatus | 'all'
    search?: string
    page?: number
    limit?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.append('status', params.status)
    if (params?.search) searchParams.append('search', params.search)
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    const query = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return fetchApi<ParentInvitationListResponse>(`/api/parent-invitations${query}`)
  },
  get: (id: string) => fetchApi<ParentInvitation>(`/api/parent-invitations/${id}`),
  create: (data: {
    parentEmail?: string
    parentName?: string
    children?: Array<{ childName: string; classId: string }>
    studentIds?: string[]
    includeMagicLink?: boolean
    expiresInDays?: number
  }) =>
    fetchApi<ParentInvitation>('/api/parent-invitations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  bulkImport: (csvContent: string, expiresInDays?: number) =>
    fetchApi<BulkInvitationResult>('/api/parent-invitations/bulk', {
      method: 'POST',
      body: JSON.stringify({ csvContent, expiresInDays }),
    }),
  revoke: (id: string) =>
    fetchApi<{ message: string }>(`/api/parent-invitations/${id}/revoke`, {
      method: 'PATCH',
    }),
  regenerate: (id: string) =>
    fetchApi<{ accessCode: string; magicToken: string; registrationUrl: string; magicLinkUrl: string }>(
      `/api/parent-invitations/${id}/regenerate`,
      { method: 'POST' }
    ),
  resend: (id: string) =>
    fetchApi<{ message: string }>(`/api/parent-invitations/${id}/resend`, {
      method: 'PATCH',
    }),

  // Registered parents endpoints
  listParents: (params?: { search?: string; classId?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.append('search', params.search)
    if (params?.classId) searchParams.append('classId', params.classId)
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    const query = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return fetchApi<{ parents: Array<{ id: string; email: string; name: string; avatarUrl?: string; lastLoginAt?: string | null; hasPassword?: boolean; createdAt: string; children: Array<{ name: string; className: string }> }>; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/api/parent-invitations/parents${query}`)
  },
  deleteParent: (id: string) =>
    fetchApi<{ message: string }>(`/api/parent-invitations/parents/${id}`, { method: 'DELETE' }),
  resetParentPassword: (id: string) =>
    fetchApi<{ message: string; emailSent: boolean }>(`/api/parent-invitations/parents/${id}/reset-password`, { method: 'POST' }),

  // Public/Parent endpoints
  validate: (data: { code?: string; token?: string }) =>
    fetchApi<InvitationValidationResponse>('/api/parent-invitations/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  redeem: (data: { code?: string; token?: string }) =>
    fetchApi<InvitationRedeemResponse>('/api/parent-invitations/redeem', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// Students
export const students = {
  list: (params?: { search?: string; classId?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.append('search', params.search)
    if (params?.classId) searchParams.append('classId', params.classId)
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    const query = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return fetchApi<StudentListResponse>(`/api/students${query}`)
  },
  search: (q: string, classId?: string) => {
    const searchParams = new URLSearchParams({ q })
    if (classId) searchParams.append('classId', classId)
    return fetchApi<StudentSearchResult[]>(`/api/students/search?${searchParams.toString()}`)
  },
  get: (id: string) => fetchApi<Student>(`/api/students/${id}`),
  create: (data: { firstName: string; lastName: string; classId: string; externalId?: string }) =>
    fetchApi<Student>('/api/students', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  bulkCreate: (students: Array<{ firstName: string; lastName: string; className: string; externalId?: string }>) =>
    fetchApi<BulkStudentResult>('/api/students/bulk', {
      method: 'POST',
      body: JSON.stringify({ students }),
    }),
  update: (id: string, data: { firstName?: string; lastName?: string; classId?: string; externalId?: string }) =>
    fetchApi<Student>(`/api/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/students/${id}`, {
      method: 'DELETE',
    }),
  bulkDelete: (ids: string[]) =>
    fetchApi<{ deleted: number }>('/api/students/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  // Test data seeding
  seedStats: () =>
    fetchApi<{ testStudents: number; testParents: number; totalStudents: number; totalParents: number }>('/api/students/seed/stats'),
  seed: (options?: { studentsPerClass?: number; includeEcaActivities?: boolean; includeEcaSelections?: boolean }) =>
    fetchApi<{ studentsCreated: number; parentsCreated: number; linksCreated: number; ecaActivitiesCreated: number; ecaSelectionsCreated: number }>('/api/students/seed', {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined,
    }),
  clearSeed: () =>
    fetchApi<{ studentsDeleted: number; parentsDeleted: number }>('/api/students/seed', {
      method: 'DELETE',
    }),
  bulkReassign: (reassignments: Array<{
    studentId?: string
    externalId?: string
    firstName?: string
    lastName?: string
    newClassName: string
  }>) =>
    fetchApi<{ updated: number; skipped: number; total: number; errors?: string[] }>('/api/students/bulk-reassign', {
      method: 'POST',
      body: JSON.stringify({ reassignments }),
    }),
}

export const links = {
  list: () => fetchApi<LinksResponse>('/api/links'),
  listAll: () => fetchApi<LinksAllResponse>('/api/links/all'),
  create: (data: { title: string; description?: string; url: string; icon?: string; imageUrl?: string; order?: number; categoryId?: string }) =>
    fetchApi<ExternalLink>('/api/links', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { title?: string; description?: string; url?: string; icon?: string; imageUrl?: string; order?: number; active?: boolean; categoryId?: string | null }) =>
    fetchApi<ExternalLink>(`/api/links/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/links/${id}`, {
      method: 'DELETE',
    }),
  createCategory: (data: { name: string; order?: number }) =>
    fetchApi<LinkCategory>('/api/links/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: string, data: { name?: string; order?: number }) =>
    fetchApi<LinkCategory>(`/api/links/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: string) =>
    fetchApi<{ message: string }>(`/api/links/categories/${id}`, {
      method: 'DELETE',
    }),
}

// Groups
export const groups = {
  list: () => fetchApi<Group[]>('/api/groups'),
  get: (id: string) => fetchApi<Group>(`/api/groups/${id}`),
  getMembers: (id: string, params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    const query = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return fetchApi<GroupMemberListResponse>(`/api/groups/${id}/members${query}`)
  },
  getStaff: (id: string) => fetchApi<GroupStaffAssignment[]>(`/api/groups/${id}/staff`),
  forParent: () => fetchApi<ParentGroupInfo[]>('/api/groups/for-parent'),
  create: (data: { name: string; description?: string; categoryId?: string; isActive?: boolean }) =>
    fetchApi<Group>('/api/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; description?: string; categoryId?: string; isActive?: boolean }) =>
    fetchApi<Group>(`/api/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/groups/${id}`, {
      method: 'DELETE',
    }),
  addMembers: (id: string, studentIds: string[], role?: string) =>
    fetchApi<{ added: number }>(`/api/groups/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ studentIds, role }),
    }),
  removeMember: (id: string, studentId: string) =>
    fetchApi<{ message: string }>(`/api/groups/${id}/members/${studentId}`, {
      method: 'DELETE',
    }),
  assignStaff: (id: string, userId: string, canMessage?: boolean, canManage?: boolean) =>
    fetchApi<GroupStaffAssignment>(`/api/groups/${id}/staff`, {
      method: 'POST',
      body: JSON.stringify({ userId, canMessage, canManage }),
    }),
  removeStaff: (id: string, userId: string) =>
    fetchApi<{ message: string }>(`/api/groups/${id}/staff/${userId}`, {
      method: 'DELETE',
    }),
  // Categories
  listCategories: () => fetchApi<GroupCategory[]>('/api/groups/categories'),
  createCategory: (data: { name: string; icon?: string; color?: string; order?: number }) =>
    fetchApi<GroupCategory>('/api/groups/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: string, data: { name?: string; icon?: string; color?: string; order?: number }) =>
    fetchApi<GroupCategory>(`/api/groups/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: string) =>
    fetchApi<{ message: string }>(`/api/groups/categories/${id}`, {
      method: 'DELETE',
    }),
  reorderCategories: (ids: string[]) =>
    fetchApi<{ message: string }>('/api/groups/categories/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
}

// ECA (Extra-Curricular Activities)
export const eca = {
  // Admin endpoints
  getSettings: () => fetchApi<EcaSettings>('/api/eca/settings'),
  updateSettings: (data: {
    selectionMode?: EcaSelectionMode
    attendanceEnabled?: boolean
    maxPriorityChoices?: number
    maxChoicesPerDay?: number
  }) =>
    fetchApi<EcaSettings>('/api/eca/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Terms
  listTerms: () => fetchApi<EcaTerm[]>('/api/eca/terms'),
  getTerm: (id: string) => fetchApi<EcaTermWithActivities>(`/api/eca/terms/${id}`),
  createTerm: (data: {
    name: string
    termNumber: number
    academicYear: string
    startDate: string
    endDate: string
    registrationOpens: string
    registrationCloses: string
    defaultBeforeSchoolStart?: string
    defaultBeforeSchoolEnd?: string
    defaultAfterSchoolStart?: string
    defaultAfterSchoolEnd?: string
  }) =>
    fetchApi<EcaTerm>('/api/eca/terms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTerm: (id: string, data: Partial<{
    name: string
    startDate: string
    endDate: string
    registrationOpens: string
    registrationCloses: string
    defaultBeforeSchoolStart: string
    defaultBeforeSchoolEnd: string
    defaultAfterSchoolStart: string
    defaultAfterSchoolEnd: string
  }>) =>
    fetchApi<EcaTerm>(`/api/eca/terms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteTerm: (id: string) =>
    fetchApi<{ message: string }>(`/api/eca/terms/${id}`, {
      method: 'DELETE',
    }),
  updateTermStatus: (id: string, status: EcaTermStatus) =>
    fetchApi<EcaTerm>(`/api/eca/terms/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Activities
  createActivity: (termId: string, data: {
    name: string
    description?: string
    categoryId?: string
    dayOfWeek: number
    timeSlot: EcaTimeSlot
    customStartTime?: string
    customEndTime?: string
    location?: string
    activityType?: EcaActivityType
    eligibleYearGroupIds?: string[]
    eligibleGender?: EcaGender
    minCapacity?: number
    maxCapacity?: number
    staffId?: string
  }) =>
    fetchApi<EcaActivity>(`/api/eca/terms/${termId}/activities`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateActivity: (id: string, data: Partial<{
    name: string
    description: string
    categoryId: string
    dayOfWeek: number
    timeSlot: EcaTimeSlot
    customStartTime: string
    customEndTime: string
    location: string
    activityType: EcaActivityType
    eligibleYearGroupIds: string[]
    eligibleGender: EcaGender
    minCapacity: number
    maxCapacity: number
    staffId: string
    isActive: boolean
  }>) =>
    fetchApi<EcaActivity>(`/api/eca/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteActivity: (id: string) =>
    fetchApi<{ message: string }>(`/api/eca/activities/${id}`, {
      method: 'DELETE',
    }),
  cancelActivity: (id: string, reason?: string) =>
    fetchApi<EcaActivity>(`/api/eca/activities/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),

  // Activity students
  getActivityStudents: (id: string) =>
    fetchApi<Array<{
      id: string
      studentId: string
      studentName: string
      className: string
      allocationType: string
      status: string
      createdAt: string
    }>>(`/api/eca/activities/${id}/students`),
  addStudentToActivity: (id: string, studentId: string) =>
    fetchApi<any>(`/api/eca/activities/${id}/students`, {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    }),
  removeStudentFromActivity: (id: string, studentId: string) =>
    fetchApi<{ message: string }>(`/api/eca/activities/${id}/students/${studentId}`, {
      method: 'DELETE',
    }),

  // Waitlist
  getActivityWaitlist: (id: string) =>
    fetchApi<Array<{
      id: string
      studentId: string
      studentName: string
      className: string
      position: number
      createdAt: string
    }>>(`/api/eca/activities/${id}/waitlist`),
  promoteFromWaitlist: (activityId: string, studentId: string) =>
    fetchApi<{ message: string }>(`/api/eca/activities/${activityId}/waitlist/${studentId}/promote`, {
      method: 'POST',
    }),

  // Invitations
  inviteStudents: (activityId: string, studentIds: string[], isTryout?: boolean) =>
    fetchApi<{ created: number; invitations: any[] }>(`/api/eca/activities/${activityId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ studentIds, isTryout }),
    }),
  updateInvitation: (id: string, data: { status?: string; tryoutResult?: string }) =>
    fetchApi<any>(`/api/eca/invitations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Allocation
  runAllocation: (termId: string, options?: { selectionMode?: EcaSelectionMode; cancelBelowMinimum?: boolean }) =>
    fetchApi<EcaAllocationResult>(`/api/eca/terms/${termId}/run-allocation`, {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined,
    }),
  previewAllocation: (termId: string, selectionMode?: EcaSelectionMode) => {
    const params = selectionMode ? `?selectionMode=${selectionMode}` : ''
    return fetchApi<EcaAllocationPreview>(`/api/eca/terms/${termId}/allocation-preview${params}`)
  },
  publishAllocation: (termId: string) =>
    fetchApi<{ message: string }>(`/api/eca/terms/${termId}/publish-allocation`, {
      method: 'POST',
    }),

  // Attendance
  getAttendance: (activityId: string, date?: string) => {
    const params = date ? `?date=${date}` : ''
    return fetchApi<EcaAttendanceSession>(`/api/eca/activities/${activityId}/attendance${params}`)
  },
  markAttendance: (activityId: string, data: EcaAttendanceMarkRequest) =>
    fetchApi<{ message: string }>(`/api/eca/activities/${activityId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  exportAttendanceHtml: async (activityId: string, startDate?: string, endDate?: string, blank?: boolean) => {
    const params = new URLSearchParams()
    if (startDate) params.append('startDate', startDate)
    if (endDate) params.append('endDate', endDate)
    if (blank) params.append('blank', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''

    const headers: Record<string, string> = {}
    const token = getAccessToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const response = await fetch(`${API_URL}/api/eca/activities/${activityId}/attendance/export${query}`, { headers })
    if (!response.ok) throw new Error('Export failed')
    return response.text()
  },

  // Suggestions
  getSuggestions: (termId: string, status?: string) => {
    const params = status ? `?status=${status}` : ''
    return fetchApi<EcaAllocationSuggestion[]>(`/api/eca/terms/${termId}/suggestions${params}`)
  },
  updateSuggestion: (id: string, status: EcaSuggestionStatus) =>
    fetchApi<EcaAllocationSuggestion>(`/api/eca/suggestions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Student allocations overview
  getStudentAllocations: (termId: string) =>
    fetchApi<Array<{
      studentId: string
      studentName: string
      className: string
      yearGroup: string
      allocations: { [dayOfWeek: number]: { activityId: string; activityName: string; rank: number | null; isCompulsory: boolean } }
    }>>(`/api/eca/terms/${termId}/student-allocations`),

  // Parent endpoints
  parent: {
    listTerms: () => fetchApi<EcaTerm[]>('/api/eca/parent/terms'),
    getTerm: (id: string, studentId?: string) => {
      const params = studentId ? `?studentId=${studentId}` : ''
      return fetchApi<ParentEcaTerm>(`/api/eca/parent/terms/${id}${params}`)
    },
    getSelections: (termId: string) =>
      fetchApi<ParentEcaSelections[]>(`/api/eca/parent/terms/${termId}/selections`),
    submitSelections: (termId: string, data: EcaSelectionSubmission) =>
      fetchApi<{ message: string; count: number }>(`/api/eca/parent/terms/${termId}/selections`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getAllocations: () => fetchApi<ParentEcaAllocations[]>('/api/eca/parent/allocations'),
    getInvitations: () =>
      fetchApi<Array<{
        id: string
        studentId: string
        studentName: string
        activityId: string
        activityName: string
        activityDescription?: string
        dayOfWeek: number
        timeSlot: string
        location?: string
        isTryout: boolean
        invitedByName: string
        createdAt: string
      }>>('/api/eca/parent/invitations'),
    respondToInvitation: (id: string, accept: boolean) =>
      fetchApi<{ message: string }>(`/api/eca/parent/invitations/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ accept }),
      }),
  },
}

// Consultations (Parents' Evening)
export const consultations = {
  // Admin endpoints
  list: () => fetchApi<ConsultationEvent[]>('/api/consultations'),
  get: (id: string) => fetchApi<ConsultationEvent>(`/api/consultations/${id}`),
  create: (data: {
    title: string
    description?: string
    date: string
    endDate?: string
    slotDuration?: number
    breakDuration?: number
    targetClass?: string
  }) =>
    fetchApi<ConsultationEvent>('/api/consultations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: {
    title?: string
    description?: string
    date?: string
    endDate?: string
    status?: ConsultationStatus
    slotDuration?: number
    breakDuration?: number
    targetClass?: string
  }) =>
    fetchApi<ConsultationEvent>(`/api/consultations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/consultations/${id}`, {
      method: 'DELETE',
    }),
  addTeacher: (id: string, data: {
    teacherId: string
    location?: string
    locationType?: string
    startTime: string
    endTime: string
  }) =>
    fetchApi<ConsultationTeacher>(`/api/consultations/${id}/teachers`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  removeTeacher: (id: string, ctId: string) =>
    fetchApi<{ message: string }>(`/api/consultations/${id}/teachers/${ctId}`, {
      method: 'DELETE',
    }),
  addCustomSlot: (id: string, ctId: string, data: { startTime: string; endTime: string; date?: string }) =>
    fetchApi<{ id: string; startTime: string; endTime: string; date?: string; isCustom: boolean }>(`/api/consultations/${id}/teachers/${ctId}/slots`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteSlot: (id: string, ctId: string, slotId: string) =>
    fetchApi<{ message: string }>(`/api/consultations/${id}/teachers/${ctId}/slots/${slotId}`, {
      method: 'DELETE',
    }),
  getBookings: (id: string) =>
    fetchApi<{
      bookings: Array<ConsultationBooking & {
        parentEmail?: string
        teacherId?: string
      }>
      stats: { totalSlots: number; bookedSlots: number }
    }>(`/api/consultations/${id}/bookings`),
  getGoogleAuthUrl: () =>
    fetchApi<{ url: string; configured: boolean }>('/api/consultations/google-auth-url'),

  // Parent endpoints
  parent: {
    list: () => fetchApi<ConsultationEvent[]>('/api/consultations/parent'),
    get: (id: string) => fetchApi<ConsultationEvent>(`/api/consultations/parent/${id}`),
    book: (data: { slotId: string; studentId: string; studentName: string; notes?: string }) =>
      fetchApi<ConsultationBooking>('/api/consultations/parent/book', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    cancelBooking: (bookingId: string) =>
      fetchApi<{ message: string }>(`/api/consultations/parent/bookings/${bookingId}`, {
        method: 'DELETE',
      }),
  },
}

export const analytics = {
  overview: () =>
    fetchApi<AnalyticsOverview>('/api/analytics/overview'),
  messages: () =>
    fetchApi<AnalyticsMessagesResponse>('/api/analytics/messages'),
  engagementTrend: () =>
    fetchApi<EngagementTrendResponse>('/api/analytics/engagement-trend'),
  ecaStats: () =>
    fetchApi<EcaStatsResponse>('/api/analytics/eca-stats'),
}

export const emergencyAlerts = {
  // Admin endpoints
  list: () =>
    fetchApi<EmergencyAlert[]>('/api/emergency-alerts'),
  get: (id: string) =>
    fetchApi<EmergencyAlert>(`/api/emergency-alerts/${id}`),
  create: (data: EmergencyAlertCreateData) =>
    fetchApi<EmergencyAlert & { parentCount: number }>('/api/emergency-alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  resolve: (id: string) =>
    fetchApi<{ id: string; status: string; resolvedAt: string; resolvedBy: string }>(`/api/emergency-alerts/${id}/resolve`, {
      method: 'PUT',
    }),
  resend: (id: string) =>
    fetchApi<{ message: string; resent: number; total: number }>(`/api/emergency-alerts/${id}/resend`, {
      method: 'POST',
    }),

  // Parent endpoints
  active: () =>
    fetchApi<EmergencyAlert[]>('/api/emergency-alerts/active'),
  acknowledge: (id: string, device?: string) =>
    fetchApi<{ acknowledged: boolean; acknowledgedAt: string }>(`/api/emergency-alerts/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ device }),
    }),
  getAcknowledgments: (id: string) =>
    fetchApi<{ totalParents: number; acknowledged: number; rate: number; acknowledgments: Array<{ parentId: string; parentName: string; parentEmail: string; acknowledgedAt: string; device?: string }> }>(`/api/emergency-alerts/${id}/acknowledgments`),
}

// School Services (Wraparound Care)
export const schoolServices = {
  // Admin endpoints
  list: () => fetchApi<SchoolService[]>('/api/school-services'),
  get: (id: string) => fetchApi<SchoolServiceWithStats>(`/api/school-services/${id}`),
  create: (data: Partial<SchoolService> & { name: string; days: string[]; startTime: string; endTime: string }) =>
    fetchApi<SchoolService>('/api/school-services', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<SchoolService>) =>
    fetchApi<SchoolService>(`/api/school-services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/school-services/${id}`, {
      method: 'DELETE',
    }),
  updateStatus: (id: string, status: ServiceStatus) =>
    fetchApi<SchoolService>(`/api/school-services/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
  getRegistrations: (id: string) =>
    fetchApi<ServiceRegistration[]>(`/api/school-services/${id}/registrations`),
  updateRegistrationStatus: (regId: string, status: RegistrationStatus) =>
    fetchApi<ServiceRegistration>(`/api/school-services/registrations/${regId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
  updatePaymentStatus: (regId: string, paymentStatus: PaymentStatus) =>
    fetchApi<ServiceRegistration>(`/api/school-services/registrations/${regId}/payment`, {
      method: 'PUT',
      body: JSON.stringify({ paymentStatus }),
    }),

  // Parent endpoints
  parent: {
    list: () => fetchApi<SchoolService[]>('/api/school-services/parent'),
    get: (id: string) => fetchApi<SchoolService>(`/api/school-services/parent/${id}`),
    register: (data: ServiceRegistrationCreate) =>
      fetchApi<ServiceRegistration>('/api/school-services/parent/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    cancelRegistration: (regId: string) =>
      fetchApi<{ message: string }>(`/api/school-services/parent/registrations/${regId}`, {
        method: 'DELETE',
      }),
    myRegistrations: () =>
      fetchApi<ServiceRegistration[]>('/api/school-services/parent/my-registrations'),
  },
}

// Inbox (Two-Way Messaging)
import type {
  ConversationListItem,
  ConversationDetail,
  ConversationMessageItem,
  AvailableContactsResponse,
  SchoolContactInfo,
} from '../types'

export const inbox = {
  // Parent endpoints
  conversations: () =>
    fetchApi<ConversationListItem[]>('/api/inbox/conversations'),
  conversation: (id: string) =>
    fetchApi<ConversationDetail>(`/api/inbox/conversations/${id}`),
  createConversation: (data: { staffId: string; studentId?: string; schoolContactId?: string }) =>
    fetchApi<{ id: string; created: boolean }>('/api/inbox/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  sendMessage: (conversationId: string, data: { content: string; replyToId?: string; attachments?: Array<{ fileName: string; fileUrl: string; fileType: string; fileSize: number }> }) =>
    fetchApi<ConversationMessageItem>(`/api/inbox/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  archiveConversation: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/inbox/conversations/${id}/archive`, {
      method: 'PATCH',
    }),
  muteConversation: (conversationId: string, muted: boolean) =>
    fetchApi<{ success: boolean; muted: boolean }>(`/api/inbox/conversations/${conversationId}/mute`, {
      method: 'PATCH',
      body: JSON.stringify({ muted }),
    }),
  searchMessages: (conversationId: string, query: string) =>
    fetchApi<ConversationMessageItem[]>(`/api/inbox/conversations/${conversationId}/search?q=${encodeURIComponent(query)}`),
  deleteMessage: (conversationId: string, messageId: string) =>
    fetchApi<{ success: boolean }>(`/api/inbox/conversations/${conversationId}/messages/${messageId}`, {
      method: 'DELETE',
    }),
  reactToMessage: (conversationId: string, messageId: string, emoji: string) =>
    fetchApi<{ id: string; emoji: string }>(`/api/inbox/conversations/${conversationId}/messages/${messageId}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),
  removeReaction: (conversationId: string, messageId: string, emoji: string) =>
    fetchApi<{ success: boolean }>(`/api/inbox/conversations/${conversationId}/messages/${messageId}/react/${emoji}`, {
      method: 'DELETE',
    }),
  exportConversation: async (conversationId: string) => {
    const token = getAccessToken()
    const response = await fetch(`${config.apiUrl}/api/inbox/conversations/${conversationId}/export`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!response.ok) throw new Error('Export failed')
    const text = await response.text()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversation-export-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  },
  availableContacts: () =>
    fetchApi<AvailableContactsResponse>('/api/inbox/contacts/available'),

  // Staff/Admin endpoints
  staffConversations: (classId?: string) => {
    const query = classId ? `?classId=${classId}` : ''
    return fetchApi<ConversationListItem[]>(`/api/inbox/staff/conversations${query}`)
  },
  staffCreateConversation: (data: { parentId: string; studentId?: string }) =>
    fetchApi<{ id: string; created: boolean }>('/api/inbox/staff/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Shared
  unreadCount: () =>
    fetchApi<{ count: number }>('/api/inbox/unread-count'),

  // Admin contact management
  contacts: () =>
    fetchApi<SchoolContactInfo[]>('/api/inbox/contacts'),
  createContact: (data: { name: string; description?: string; icon?: string; assignedUserId: string; order?: number }) =>
    fetchApi<SchoolContactInfo>('/api/inbox/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateContact: (id: string, data: { name?: string; description?: string; icon?: string; assignedUserId?: string; order?: number }) =>
    fetchApi<SchoolContactInfo>(`/api/inbox/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteContact: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/inbox/contacts/${id}`, {
      method: 'DELETE',
    }),
}

// Search
export interface SearchResult {
  type: string
  id: string
  title: string
  subtitle?: string
  date?: string
  route?: string
}

export const search = {
  query: (q: string) =>
    fetchApi<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`),
}

// Cafeteria
import type { CafeteriaMenu } from '../types'

export const cafeteria = {
  current: () => fetchApi<CafeteriaMenu | null>('/api/cafeteria/current'),
  week: (date: string) => fetchApi<CafeteriaMenu | null>(`/api/cafeteria/week/${date}`),
  // Admin
  listAll: () => fetchApi<CafeteriaMenu[]>('/api/cafeteria/all'),
  get: (id: string) => fetchApi<CafeteriaMenu>(`/api/cafeteria/${id}`),
  create: (data: {
    weekOf: string
    title?: string
    imageUrl?: string
    orderUrl?: string
    items?: Array<{ dayOfWeek: number; mealType?: string; name: string; description?: string; dietaryTags?: string[]; calories?: number; isDefault?: boolean }>
  }) => fetchApi<CafeteriaMenu>('/api/cafeteria', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: {
    title?: string
    imageUrl?: string
    orderUrl?: string
    isPublished?: boolean
    items?: Array<{ dayOfWeek: number; mealType?: string; name: string; description?: string; dietaryTags?: string[]; calories?: number; isDefault?: boolean }>
  }) => fetchApi<{ success: boolean }>(`/api/cafeteria/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi<{ success: boolean }>(`/api/cafeteria/${id}`, { method: 'DELETE' }),
  duplicate: (id: string, weekOf: string) =>
    fetchApi<{ id: string; weekOf: string }>(`/api/cafeteria/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ weekOf }) }),
}

// Inclusion
export const inclusion = {
  myChildrenIeps: () =>
    fetchApi<import('../types').StudentIep[]>('/api/inclusion/my-children'),
  apiKeys: () =>
    fetchApi<Array<{ id: string; label: string; isActive: boolean; lastUsedAt: string | null; createdAt: string }>>('/api/inclusion/api-keys'),
  createApiKey: (label: string) =>
    fetchApi<{ id: string; label: string; key: string; createdAt: string }>('/api/inclusion/api-keys', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  revokeApiKey: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/inclusion/api-keys/${id}`, {
      method: 'DELETE',
    }),
}

export default {
  auth,
  messages,
  forms,
  events,
  schedule,
  termDates,
  weeklyMessage,
  knowledge,
  pulse,
  users,
  classes,
  yearGroups,
  policies,
  files,
  staff,
  schools,
  auditLogs,
  notifications,
  deviceTokens,
  parentInvitations,
  students,
  links,
  groups,
  eca,
  consultations,
  analytics,
  emergencyAlerts,
  schoolServices,
  inbox,
  search,
  cafeteria,
  inclusion,
}
