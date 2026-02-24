import { config } from '../config'
import type {
  User,
  Message,
  Form,
  FormWithResponses,
  FormField,
  FormType,
  FormStatus,
  FormResponseData,
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
} from '../types'

const API_URL = config.apiUrl

// Token state
let accessToken: string | null = null
let refreshTokenValue: string | null = localStorage.getItem('refreshToken')

export function setTokens(access: string, refresh: string) {
  accessToken = access
  refreshTokenValue = refresh
  localStorage.setItem('refreshToken', refresh)
}

export function clearTokens() {
  accessToken = null
  refreshTokenValue = null
  localStorage.removeItem('refreshToken')
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
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

// Auth
export const auth = {
  me: () => fetchApi<User>('/auth/me'),
  login: async (email: string, password: string) => {
    const result = await fetchApi<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setTokens(result.accessToken, result.refreshToken)
    return result.user
  },
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
  create: (data: {
    title: string
    content: string
    targetClass: string
    classId?: string
    yearGroupId?: string
    actionType?: string
    actionLabel?: string
    actionDueDate?: string
    actionAmount?: string
    isPinned?: boolean
    isUrgent?: boolean
    expiresAt?: string
    formId?: string
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
    actionType?: string
    actionLabel?: string
    actionDueDate?: string
    actionAmount?: string
    isPinned?: boolean
    isUrgent?: boolean
    expiresAt?: string
    formId?: string
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
  create: (data: {
    halfTermName: string
    status?: string
    opensAt: string
    closesAt: string
    additionalQuestionKey?: string | null
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
  avatarUrl?: string
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
}

// Schools (Super Admin)
export interface SchoolWithCount extends School {
  _count?: { users: number }
  createdAt?: string
  updatedAt?: string
}

export const schools = {
  list: () => fetchApi<SchoolWithCount[]>('/api/schools'),
  get: (id: string) => fetchApi<SchoolWithCount>(`/api/schools/${id}`),
  updateBranding: (id: string, data: Partial<School>) =>
    fetchApi<School>(`/api/schools/${id}/branding`, {
      method: 'PATCH',
      body: JSON.stringify(data),
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
}
