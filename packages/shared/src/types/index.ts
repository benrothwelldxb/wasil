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
  twoFactorEnabled?: boolean
  twoFactorRequired?: boolean
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
  principalName?: string
  principalTitle?: string
  archived?: boolean
}

export interface SchoolWithCount extends School {
  _count?: { users: number; students?: number; classes?: number; messages?: number }
  parentCount?: number
  staffCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface SchoolStats {
  parentCount: number
  staffCount: number
  adminCount: number
  studentCount: number
  classCount: number
  messageCount: number
  formCount: number
  ecaTermCount: number
  activeAllocations: number
  latestActivity: string | null
  recentAuditLogs: Array<{
    id: string
    userName: string
    action: string
    resourceType: string
    resourceId: string
    metadata: Record<string, unknown> | null
    createdAt: string
  }>
}

export interface SystemStats {
  totalSchools: number
  totalUsers: number
  totalParents: number
  totalStudents: number
  totalMessages: number
  totalForms: number
  messagesThisMonth: number
  schoolsThisMonth: number
  mostActiveSchools: Array<{
    schoolId: string
    name: string
    messageCount: number
  }>
}

export interface SchoolUser {
  id: string
  email: string
  name: string
  role: Role
  avatarUrl?: string
  createdAt?: string
  updatedAt?: string
}

export interface CreateSchoolData {
  name: string
  shortName?: string
  city?: string
  academicYear?: string
  brandColor?: string
  accentColor?: string
  tagline?: string
  logoUrl?: string
  logoIconUrl?: string
  paymentUrl?: string
}

export interface CreateAdminData {
  email: string
  name: string
  role: 'ADMIN' | 'STAFF'
}

export interface CreateAdminResponse extends SchoolUser {
  tempPassword: string
  note: string
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

export interface MessageAttachment {
  id: string
  messageId: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  createdAt: string
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
  scheduledAt?: string
  isScheduled?: boolean
  expiresAt?: string
  formId?: string
  form?: Form & { userResponse?: FormResponseData | null }
  attachments?: MessageAttachment[]
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
export type FormFieldType = 'text' | 'textarea' | 'checkbox' | 'select' | 'number' | 'date' | 'signature'

export interface FormFieldCondition {
  fieldId: string    // which field to check
  operator: 'equals' | 'not_equals' | 'is_checked' | 'is_not_checked'
  value?: string     // for equals/not_equals
}

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  placeholder?: string
  required: boolean
  removable: boolean
  options?: string[]
  validation?: { min?: number; max?: number }
  page?: number                  // page number (0-indexed), undefined = page 0
  condition?: FormFieldCondition // show only when condition is met
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

export interface FormFieldStat {
  label: string
  type: string
  // checkbox
  checkedCount?: number
  uncheckedCount?: number
  // select
  optionCounts?: Record<string, number>
  // number
  average?: number
  min?: number
  max?: number
  // text / textarea / date / signature
  filledCount?: number
  emptyCount?: number
}

export interface FormAnalytics {
  totalResponses: number
  totalTargeted: number
  completionRate: number
  fieldStats: Record<string, FormFieldStat>
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
  imageUrl?: string | null
  scheduledAt?: string | null
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

export interface PulseCustomQuestion {
  id: string
  text: string
  type: 'LIKERT_5' | 'TEXT_OPTIONAL'
}

export interface PulseSurvey {
  id: string
  halfTermName: string
  status: PulseSurveyStatus
  opensAt: string
  closesAt: string
  schoolId: string
  additionalQuestionKey?: string | null
  customQuestions?: PulseCustomQuestion[] | null
  questions: PulseQuestion[]
  userResponse?: PulseResponse
  responseCount?: number
}

export interface PulseComparison {
  id: string
  halfTermName: string
  responseCount: number
  coreAverages: Record<string, number | null>
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
  | 'GROUP' | 'GROUP_CATEGORY' | 'ECA_TERM' | 'ECA_ACTIVITY' | 'ECA_ALLOCATION'

export interface AuditLogChange {
  from: unknown
  to: unknown
}

export interface AuditLog {
  id: string
  userId: string
  userName: string
  action: AuditAction
  resourceType: AuditResourceType
  resourceId: string
  metadata: Record<string, unknown> | null
  changes: Record<string, AuditLogChange> | null
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
  photoUrl?: string | null
  classId: string
  className: string
  parentCount: number
}

// Inclusion/IEP types
export interface StudentIep {
  id: string
  studentId: string
  studentName: string
  className: string
  title: string
  status: string
  targets: IepTarget[]
  reviewDate?: string | null
  keyWorker?: string | null
  notes?: string | null
  syncedAt: string
  updatedAt: string
}

export interface IepTarget {
  area: string      // e.g. "Communication", "Social Skills"
  target: string    // The target description
  strategies: string // How to achieve it
  progress?: string  // Current progress notes
  status?: string    // "Not Started", "In Progress", "Achieved"
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

// Analytics Types
export interface AnalyticsOverview {
  totalParents: number
  activeParents: number
  adoptionRate: number
  totalStudents: number
  totalMessages: number
  messageReadRate: number
  formsCompletionRate: number
  eventsRsvpRate: number
  ecaParticipationRate: number
  pulseAverageRating: number
  pulseResponseRate: number
}

export interface AnalyticsMessage {
  id: string
  title: string
  sentAt: string
  targetClass: string
  totalRecipients: number
  acknowledged: number
  readRate: number
  hasForm: boolean
  formResponses: number
  formCompletionRate: number
}

export interface AnalyticsMessagesResponse {
  messages: AnalyticsMessage[]
}

export interface EngagementWeek {
  week: string
  label: string
  activeUsers: number
  messagesRead: number
  formsCompleted: number
}

export interface EngagementTrendResponse {
  weeks: EngagementWeek[]
}

export interface EcaPopularActivity {
  name: string
  demand: number
  capacity: number
}

export interface EcaStatsResponse {
  totalActivities: number
  totalAllocations: number
  firstChoiceRate: number
  averageActivitiesPerStudent: number
  mostPopular: EcaPopularActivity[]
}

// School Services Types
export type ServiceStatus = 'DRAFT' | 'PUBLISHED' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'ACTIVE' | 'ARCHIVED'
export type RegistrationStatus = 'PENDING' | 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED'
export type PaymentStatus = 'UNPAID' | 'PAID' | 'PARTIAL' | 'WAIVED'

export interface SchoolService {
  id: string
  schoolId: string
  name: string
  description?: string | null
  details?: string | null
  days: string[] // parsed from JSON
  startTime: string
  endTime: string
  costPerSession?: number | null
  costPerWeek?: number | null
  costPerTerm?: number | null
  costDescription?: string | null
  costIsFrom?: boolean
  currency?: string
  paymentMethod?: string | null  // "ONLINE", "CASH_ONLY", "FREE"
  paymentUrl?: string | null     // Custom payment link
  capacity?: number | null
  eligibleClasses?: string[] | null
  eligibleYears?: string[] | null
  status: ServiceStatus
  registrationOpens?: string | null
  registrationCloses?: string | null
  serviceStarts?: string | null
  serviceEnds?: string | null
  location?: string | null
  staffName?: string | null
  imageUrl?: string | null
  sortOrder: number
  registeredCount?: number
  createdAt: string
  updatedAt: string
}

export interface SchoolServiceWithStats extends SchoolService {
  registrations?: ServiceRegistration[]
  registeredCount: number
  confirmedCount?: number
  pendingCount?: number
  waitlistedCount?: number
  paidCount?: number
  unpaidCount?: number
}

export interface ServiceRegistration {
  id: string
  serviceId: string
  parentId: string
  studentId: string
  studentName: string
  className: string
  days: string[] // parsed from JSON
  status: RegistrationStatus
  paymentStatus: PaymentStatus
  notes?: string | null
  startDate?: string | null
  createdAt: string
  updatedAt: string
  parentName?: string
  parentEmail?: string
  serviceName?: string
}

export interface ServiceRegistrationCreate {
  serviceId: string
  studentId: string
  studentName: string
  className: string
  days: string[]
  notes?: string
  startDate?: string
}

// Notification Preference Types
export interface NotificationPreferences {
  posts: boolean
  directMessages: boolean
  emergencyAlerts: boolean
  forms: boolean
  events: boolean
  weeklyUpdates: boolean
  pulseSurveys: boolean
  ecaUpdates: boolean
  consultations: boolean
  schoolServices: boolean
}

// Cafeteria Types
export interface CafeteriaMenu {
  id: string
  weekOf: string
  title?: string | null
  imageUrl?: string | null
  orderUrl?: string | null
  isPublished: boolean
  itemCount?: number
  items?: CafeteriaMenuItem[]
  createdAt?: string
}

export interface CafeteriaMenuItem {
  id: string
  dayOfWeek: number
  dayName: string
  mealType: string
  name: string
  description?: string | null
  dietaryTags: string[]
  allergens: string[]
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  price?: number | null
  isDefault: boolean
  order?: number
}

// Inbox / Two-Way Messaging Types
export interface SchoolContactInfo {
  id: string
  name: string
  description?: string | null
  icon?: string | null
  assignedUserId: string
  assignedUserName: string
  assignedUserEmail?: string
  order: number
  archived: boolean
  createdAt: string
}

export interface ConversationListItem {
  id: string
  staffId?: string
  staffName: string
  staffAvatarUrl?: string | null
  parentId?: string
  parentName?: string
  parentAvatarUrl?: string | null
  studentId?: string | null
  studentName?: string | null
  className?: string | null
  schoolContactId?: string | null
  schoolContactName?: string | null
  schoolContactIcon?: string | null
  lastMessageAt: string
  lastMessageText?: string | null
  unreadCount: number
  muted?: boolean
  createdAt: string
}

export interface MessageReaction {
  id: string
  messageId: string
  userId: string
  emoji: string
  createdAt: string
}

export interface ConversationMessageItem {
  id: string
  senderId: string
  senderName: string
  content: string
  readAt: string | null
  deleted?: boolean
  deletedAt?: string | null
  replyTo?: {
    id: string
    content: string
    senderName: string
    deleted?: boolean
  } | null
  reactions?: Record<string, { count: number; reacted: boolean }>
  createdAt: string
  attachments: ConversationAttachmentItem[]
}

export interface ConversationAttachmentItem {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
}

export interface MessageSearchResult {
  id: string
  senderId: string
  senderName: string
  content: string
  createdAt: string
}

export interface ConversationDetail {
  id: string
  parentId: string
  parentName: string
  parentAvatarUrl?: string | null
  staffId: string
  staffName: string
  staffAvatarUrl?: string | null
  studentId?: string | null
  studentName?: string | null
  className?: string | null
  schoolContactId?: string | null
  schoolContactName?: string | null
  schoolContactIcon?: string | null
  lastMessageAt: string
  createdAt: string
  muted?: boolean
  messages: ConversationMessageItem[]
}

export interface AvailableContactsResponse {
  teachers: Array<{
    id: string
    name: string
    avatarUrl: string | null
    classes: Array<{ id: string; name: string }>
  }>
  schoolContacts: Array<{
    id: string
    name: string
    description?: string | null
    icon?: string | null
    assignedUserId: string
    assignedUserName: string
  }>
  children: Array<{
    studentId: string
    studentName: string
    classId: string
    className: string
  }>
}

// ECA Types
export * from './eca'

// Emergency Alert Types
export type AlertType = 'LOCKDOWN' | 'WEATHER' | 'EARLY_DISMISSAL' | 'MEDICAL' | 'SECURITY' | 'GENERAL'
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM'
export type AlertStatus = 'ACTIVE' | 'RESOLVED'
export type DeliveryChannel = 'PUSH' | 'SMS' | 'WHATSAPP' | 'EMAIL'
export type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED'

export interface EmergencyAlert {
  id: string
  title: string
  message: string
  type: AlertType
  severity: AlertSeverity
  status: AlertStatus
  sendPush: boolean
  sendSms: boolean
  sendWhatsapp: boolean
  sendEmail: boolean
  targetClass?: string | null
  sentAt: string
  resolvedAt?: string | null
  resolvedBy?: string | null
  createdBy: string
  isDrill?: boolean
  drillName?: string | null
  requireAck?: boolean
  acknowledged?: boolean
  acknowledgedAt?: string | null
  ackCount?: number
  totalDeliveries?: number
  deliveryStats?: Record<string, { sent: number; delivered: number; failed: number; pending: number }>
  parentCount?: number
  createdAt: string
}

export interface EmergencyAlertCreateData {
  title: string
  message: string
  type?: AlertType
  severity?: AlertSeverity
  targetClass?: string
  sendPush?: boolean
  sendSms?: boolean
  sendWhatsapp?: boolean
  sendEmail?: boolean
  isDrill?: boolean
  drillName?: string
  requireAck?: boolean
}

// Consultation Types
export type ConsultationStatus = 'DRAFT' | 'PUBLISHED' | 'BOOKING_OPEN' | 'BOOKING_CLOSED' | 'COMPLETED'

export interface ConsultationEvent {
  id: string
  schoolId: string
  title: string
  description?: string | null
  date: string
  endDate?: string | null
  status: ConsultationStatus
  slotDuration: number
  breakDuration: number
  targetClass?: string | null
  teachers?: ConsultationTeacher[]
  createdAt: string
  updatedAt: string
}

export type ConsultationLocationType = 'IN_PERSON' | 'GOOGLE_MEET' | 'ZOOM' | 'TEAMS' | 'CUSTOM'

export interface ConsultationTeacher {
  id: string
  consultationId: string
  teacherId: string
  teacherName: string
  teacherRole?: string
  teacherPosition?: string | null
  assignedClasses?: string[]
  location?: string | null
  locationType?: ConsultationLocationType
  startTime: string
  endTime: string
  slots?: ConsultationSlot[]
}

export interface ConsultationSlot {
  id: string
  consultationTeacherId: string
  startTime: string
  endTime: string
  date?: string | null
  isBreak: boolean
  isCustom?: boolean
  booking?: ConsultationBooking | null
}

export interface ConsultationBooking {
  id: string
  slotId: string
  parentId: string
  parentName?: string
  studentId: string
  studentName: string
  notes?: string | null
  meetingLink?: string | null
  createdAt: string
  // Enriched fields for display
  teacherName?: string
  teacherLocation?: string | null
  slotStartTime?: string
  slotEndTime?: string
  consultationTitle?: string
  consultationDate?: string
}
