// User & Auth types
export type Role = 'PARENT' | 'ADMIN' | 'SUPER_ADMIN'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  schoolId: string
  avatarUrl?: string
  children?: Child[]
  school?: School
}

export interface Child {
  id: string
  name: string
  classId: string
  className: string
}

// School types
export interface School {
  id: string
  name: string
  shortName: string
  city: string
  academicYear: string
  brandColor: string
  accentColor: string
  tagline?: string
  logoUrl?: string
  logoIconUrl?: string
}

// Class types
export interface Class {
  id: string
  name: string
  colorBg: string
  colorText: string
  schoolId: string
}

// Message types
export interface ActionRequired {
  type: 'consent' | 'payment' | 'rsvp'
  label: string
  dueDate: string
  amount?: string
}

export interface Message {
  id: string
  title: string
  content: string
  targetClass: string
  classId?: string
  schoolId: string
  senderId: string
  senderName: string
  actionType?: string
  actionLabel?: string
  actionDueDate?: string
  actionAmount?: string
  isPinned?: boolean
  isUrgent?: boolean
  acknowledged?: boolean
  acknowledgmentCount?: number
  createdAt: string
}

export interface MessageAcknowledgment {
  id: string
  messageId: string
  userId: string
  createdAt: string
}

// Survey types
export interface Survey {
  id: string
  question: string
  options: string[]
  active: boolean
  targetClass: string
  classId?: string
  schoolId: string
  createdAt: string
  userResponse?: string
}

export interface SurveyResponse {
  id: string
  surveyId: string
  userId: string
  response: string
  createdAt: string
}

// Event types
export interface Event {
  id: string
  title: string
  description?: string
  date: string
  time?: string
  location?: string
  targetClass: string
  classId?: string
  schoolId: string
  requiresRsvp: boolean
  createdAt: string
  userRsvp?: EventRsvpStatus
}

export type EventRsvpStatus = 'attending' | 'not_attending' | 'maybe'

export interface EventRsvp {
  id: string
  eventId: string
  userId: string
  status: EventRsvpStatus
  createdAt: string
}

// Term Date types
export type TermDateType = 'term-start' | 'term-end' | 'half-term' | 'public-holiday' | 'induction'

export interface TermDate {
  id: string
  term: number
  termName: string
  label: string
  sublabel?: string
  date: string
  endDate?: string
  type: TermDateType
  color: string
  schoolId: string
}

// Schedule types
export interface ScheduleItem {
  id: string
  targetClass: string
  classId?: string
  schoolId: string
  isRecurring: boolean
  dayOfWeek?: number
  active: boolean
  date?: string
  type: string
  label: string
  description?: string
  icon?: string
  createdAt: string
}

// Weekly Message types
export interface WeeklyMessage {
  id: string
  title: string
  content: string
  weekOf: string
  isCurrent: boolean
  schoolId: string
  heartCount: number
  hasHearted?: boolean
  createdAt: string
}

export interface WeeklyMessageHeart {
  id: string
  messageId: string
  userId: string
  createdAt: string
}

// Knowledge Base types
export interface KnowledgeCategory {
  id: string
  name: string
  icon: string
  color: string
  order: number
  schoolId: string
  articles: KnowledgeArticle[]
}

export interface KnowledgeArticle {
  id: string
  title: string
  content: string
  categoryId: string
  updatedAt: string
  createdAt: string
}

// Pulse Survey types
export type PulseSurveyStatus = 'DRAFT' | 'OPEN' | 'CLOSED'

export interface PulseSurvey {
  id: string
  halfTermName: string
  status: PulseSurveyStatus
  opensAt: string
  closesAt: string
  schoolId: string
  questions: PulseQuestion[]
  userResponse?: PulseResponse
  responseCount?: number
}

export interface PulseQuestion {
  id: string
  stableKey: string
  text: string
  type: 'LIKERT_5' | 'TEXT_OPTIONAL'
  order: number
}

export interface PulseResponse {
  id: string
  pulseId: string
  userId: string
  answers: Record<string, number | string>
  createdAt: string
}

// Class color mapping
export interface ClassColors {
  [className: string]: {
    bg: string
    text: string
  }
}
