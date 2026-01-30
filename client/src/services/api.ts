import { config } from '../config'
import type {
  User,
  Message,
  Survey,
  Event,
  ScheduleItem,
  TermDate,
  WeeklyMessage,
  KnowledgeCategory,
  PulseSurvey,
  Class,
  EventRsvpStatus,
  School,
  YearGroup,
} from '../types'

const API_URL = config.apiUrl

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

// Auth
export const auth = {
  me: () => fetchApi<User>('/auth/me'),
  demoLogin: (email: string, role?: string) =>
    fetchApi<User>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
  logout: () =>
    fetchApi<{ message: string }>('/auth/logout', {
      method: 'POST',
    }),
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

// Survey with responses (for admin list)
export interface SurveyWithResponses extends Survey {
  responses: Array<{ id: string; response: string; userName: string; userEmail: string; createdAt: string }>
  isExpired?: boolean
  updatedAt?: string
}

// Surveys
export const surveys = {
  list: () => fetchApi<Survey[]>('/api/surveys'),
  listAll: () => fetchApi<SurveyWithResponses[]>('/api/surveys/all'),
  create: (data: {
    question: string
    options: string[]
    targetClass: string
    classId?: string
    yearGroupId?: string
    expiresAt?: string
  }) =>
    fetchApi<Survey>('/api/surveys', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: {
    question: string
    options: string[]
    targetClass: string
    classId?: string
    yearGroupId?: string
    active?: boolean
    expiresAt?: string
  }) =>
    fetchApi<Survey>(`/api/surveys/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<{ message: string }>(`/api/surveys/${id}`, {
      method: 'DELETE',
    }),
  respond: (id: string, response: string) =>
    fetchApi<{ id: string }>(`/api/surveys/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response }),
    }),
  close: (id: string) =>
    fetchApi<{ id: string }>(`/api/surveys/${id}/close`, {
      method: 'PATCH',
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

// Pulse Surveys
export const pulse = {
  list: () => fetchApi<PulseSurvey[]>('/api/pulse'),
  listAll: () => fetchApi<PulseSurvey[]>('/api/pulse/all'),
  get: (id: string) => fetchApi<PulseSurvey>(`/api/pulse/${id}`),
  create: (data: {
    halfTermName: string
    status?: string
    opensAt: string
    closesAt: string
  }) =>
    fetchApi<PulseSurvey>('/api/pulse', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: {
    halfTermName: string
    opensAt: string
    closesAt: string
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
}

// Policies
export const policies = {
  list: () => fetchApi<any[]>('/api/policies'),
  create: (data: { name: string; description?: string; fileUrl: string; fileSize?: number }) =>
    fetchApi<any>('/api/policies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; description?: string; fileUrl?: string; fileSize?: number }) =>
    fetchApi<any>(`/api/policies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
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

export default {
  auth,
  messages,
  surveys,
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
}
