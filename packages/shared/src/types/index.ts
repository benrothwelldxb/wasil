// User & Auth types
export type Role = 'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  schoolId: string
  avatarUrl?: string
  preferredLanguage?: string
  children?: Child[]
  studentLinks?: ParentStudentLinkInfo[]
  school?: School
}

// Language types
export interface SupportedLanguage {
  code: string
  name: string
}

export interface Child {
  id: string
  name: string
  classId: string
  className: string
  teacherName?: string | null
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
  paymentUrl?: string
}

// Year Group types
export interface YearGroup {
  id: string
  name: string
  order: number
  schoolId: string
  classCount?: number
}

// Class types
export interface Class {
  id: string
  name: string
  colorBg: string
  colorText: string
  schoolId: string
  yearGroupId?: string
  yearGroup?: { id: string; name: string; order: number } | null
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
  yearGroupId?: string
  groupId?: string
  schoolId: string
  senderId: string
  senderName: string
  actionType?: string
  actionLabel?: string
  actionDueDate?: string
  actionAmount?: string
  isPinned?: boolean
  isUrgent?: boolean
  expiresAt?: string
  formId?: string
  form?: Form & { userResponse?: FormResponseData | null }
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

// Form types
export type FormFieldType = 'text' | 'textarea' | 'checkbox' | 'select' | 'number' | 'date'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder?: string
  required: boolean
  removable: boolean
  options?: string[]
  validation?: { min?: number; max?: number }
}

export type FormType = 'permission-consent' | 'trip-consent' | 'payment-request' | 'medical-info' | 'general-info' | 'quick-poll'
export type FormStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED'

export interface Form {
  id: string
  title: string
  description?: string
  type: FormType
  status: FormStatus
  fields: FormField[]
  targetClass: string
  classIds: string[]
  yearGroupIds: string[]
  schoolId: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
  userResponse?: FormResponseData | null
}

export interface FormResponseData {
  id: string
  formId: string
  userId: string
  answers: Record<string, unknown>
  createdAt: string
}

export interface FormListResponse {
  forms: Form[]
}

export interface FormWithResponses extends Form {
  responses: Array<{
    id: string
    answers: Record<string, unknown>
    userName: string
    userEmail: string
    createdAt: string
  }>
  responseCount: number
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
  yearGroupId?: string
  groupId?: string
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
  yearGroupId?: string
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
  additionalQuestionKey?: string | null
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

export interface PulseOptionalQuestion {
  key: string
  text: string
  type: 'LIKERT_5' | 'TEXT_OPTIONAL'
}

export interface PulseQuestionStat {
  question: string
  type: 'LIKERT_5' | 'TEXT_OPTIONAL'
  average?: number
  distribution?: { 1: number; 2: number; 3: number; 4: number; 5: number }
  responses?: string[]
}

export interface PulseAnalytics {
  responseCount: number
  totalParents: number
  responseRate: number
  questionStats: Record<string, PulseQuestionStat>
}

// Audit Log types
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE'

export type AuditResourceType =
  | 'MESSAGE' | 'SURVEY' | 'EVENT' | 'WEEKLY_MESSAGE' | 'TERM_DATE'
  | 'PULSE_SURVEY' | 'YEAR_GROUP' | 'CLASS' | 'STAFF' | 'STUDENT' | 'POLICY'
  | 'FILE' | 'FOLDER' | 'SCHEDULE_ITEM' | 'KNOWLEDGE_CATEGORY'
  | 'KNOWLEDGE_ARTICLE' | 'SCHOOL' | 'FORM' | 'PARENT_INVITATION'
  | 'GROUP' | 'GROUP_CATEGORY'

export interface AuditLog {
  id: string
  userId: string
  userName: string
  action: AuditAction
  resourceType: AuditResourceType
  resourceId: string
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
}

export interface AuditLogListResponse {
  logs: AuditLog[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Parent Invitation types
export type InvitationStatus = 'PENDING' | 'REDEEMED' | 'EXPIRED' | 'REVOKED'

export interface ChildInvitationLink {
  childName: string
  className: string
  classId: string
}

export interface StudentInvitationLink {
  studentId: string
  studentName: string
  className: string
}

export interface ParentInvitation {
  id: string
  accessCode: string
  magicToken?: string
  parentEmail?: string
  parentName?: string
  children: ChildInvitationLink[]
  students?: StudentInvitationLink[]
  status: InvitationStatus
  expiresAt?: string
  redeemedAt?: string
  redeemedByUser?: {
    id: string
    name: string
    email: string
  }
  createdBy?: {
    id: string
    name: string
  }
  createdAt: string
  schoolName?: string
  qrCodeUrl?: string
  registrationUrl?: string
  magicLinkUrl?: string
}

export interface ParentInvitationListResponse {
  invitations: ParentInvitation[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface InvitationValidationResponse {
  valid: boolean
  invitationId: string
  school: {
    id: string
    name: string
    logoUrl?: string
    brandColor?: string
  }
  children: Array<{
    childName: string
    className: string
  }>
  students?: Array<{
    studentId: string
    studentName: string
    className: string
  }>
  parentName?: string
  parentEmail?: string
}

export interface InvitationRedeemResponse {
  success: boolean
  school: {
    id: string
    name: string
  }
  children: Array<{
    childName: string
    className: string
  }>
  students?: Array<{
    studentId: string
    studentName: string
    className: string
  }>
}

export interface BulkInvitationResult {
  created: number
  skipped: number
  invitations: Array<{
    parentEmail: string
    accessCode: string
    childCount: number
  }>
  errors?: string[]
}

// Notification types
export type DeviceTokenPlatform = 'ios' | 'android' | 'web'

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  resourceType?: string | null
  resourceId?: string | null
  data?: Record<string, unknown> | null
  read: boolean
  createdAt: string
}

export interface NotificationListResponse {
  notifications: Notification[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Class color mapping
export interface ClassColors {
  [className: string]: {
    bg: string
    text: string
  }
}

// Student types
export interface Student {
  id: string
  firstName: string
  lastName: string
  fullName: string
  externalId?: string
  classId: string
  className: string
  parentCount: number
}

export interface StudentSearchResult {
  id: string
  fullName: string
  className: string
  hasParent: boolean
}

export interface ParentStudentLinkInfo {
  studentId: string
  studentName: string
  className: string
  teacherName?: string | null
}

export interface StudentListResponse {
  students: Student[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface BulkStudentResult {
  created: number
  skipped: number
  errors?: string[]
  students: Array<{ id: string; firstName: string; lastName: string; className: string }>
}

// External Link types
export interface LinkCategory {
  id: string
  name: string
  order: number
  links?: ExternalLink[]
  createdAt?: string
}

export interface ExternalLink {
  id: string
  title: string
  description?: string | null
  url: string
  icon?: string | null
  imageUrl?: string | null
  order: number
  active?: boolean
  categoryId?: string | null
  createdAt?: string
}

export interface LinksResponse {
  categories: Array<LinkCategory & { links: ExternalLink[] }>
  uncategorized: ExternalLink[]
}

export interface LinksAllResponse {
  categories: LinkCategory[]
  links: ExternalLink[]
}

// Group/Team types
export interface GroupCategory {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  order: number
  groupCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface Group {
  id: string
  name: string
  description?: string | null
  categoryId?: string | null
  category?: {
    id: string
    name: string
    icon?: string | null
    color?: string | null
  } | null
  schoolId: string
  isActive: boolean
  memberCount?: number
  staffCount?: number
  createdAt: string
  updatedAt?: string
}

export interface GroupMember {
  id: string
  studentId: string
  studentName: string
  firstName: string
  lastName: string
  classId: string
  className: string
  role?: string | null
  joinedAt: string
}

export interface GroupStaffAssignment {
  id: string
  userId: string
  userName: string
  userEmail: string
  userRole: string
  canMessage: boolean
  canManage: boolean
  createdAt: string
}

export interface GroupMemberListResponse {
  members: GroupMember[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ParentGroupInfo {
  id: string
  name: string
  description?: string | null
  category?: {
    id: string
    name: string
    icon?: string | null
    color?: string | null
  } | null
  children: Array<{
    studentId: string
    studentName: string
  }>
}
