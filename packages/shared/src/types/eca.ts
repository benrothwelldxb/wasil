// ECA (Extra-Curricular Activities) Types

export type EcaSelectionMode = 'FIRST_COME_FIRST_SERVED' | 'SMART_ALLOCATION'

export type EcaTermStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'ALLOCATION_COMPLETE'
  | 'ACTIVE'
  | 'COMPLETED'

export type EcaTimeSlot = 'BEFORE_SCHOOL' | 'AFTER_SCHOOL'
export type EcaActivityType = 'OPEN' | 'INVITE_ONLY' | 'COMPULSORY' | 'TRYOUT'
export type EcaGender = 'MIXED' | 'BOYS_ONLY' | 'GIRLS_ONLY'
export type EcaAllocationType =
  | 'FIRST_COME'
  | 'SMART_PRIORITY'
  | 'SMART_RANKED'
  | 'SMART_REALLOCATION'
  | 'SMART_FORCED'
  | 'INVITED'
  | 'COMPULSORY'
  | 'MANUAL'
export type EcaAllocationStatus = 'CONFIRMED' | 'WITHDRAWN' | 'REMOVED'
export type EcaInvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED'
export type EcaTryoutResult = 'SUCCESSFUL' | 'UNSUCCESSFUL' | 'PENDING'
export type EcaAttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE'

export interface EcaSettings {
  id: string
  schoolId: string
  selectionMode: EcaSelectionMode
  attendanceEnabled: boolean
  maxPriorityChoices: number
  maxChoicesPerDay: number
  createdAt: string
  updatedAt: string
}

export interface EcaTerm {
  id: string
  schoolId: string
  name: string
  termNumber: number
  academicYear: string
  startDate: string
  endDate: string
  registrationOpens: string
  registrationCloses: string
  defaultBeforeSchoolStart?: string | null
  defaultBeforeSchoolEnd?: string | null
  defaultAfterSchoolStart?: string | null
  defaultAfterSchoolEnd?: string | null
  status: EcaTermStatus
  allocationRun: boolean
  createdAt: string
  updatedAt: string
  // Counts for admin view
  activityCount?: number
  selectionCount?: number
  allocationCount?: number
}

export interface EcaTermWithActivities extends EcaTerm {
  activities: EcaActivity[]
}

export interface EcaActivity {
  id: string
  ecaTermId: string
  schoolId: string
  name: string
  description?: string | null
  groupId?: string | null
  categoryId?: string | null
  category?: {
    id: string
    name: string
    icon?: string | null
    color?: string | null
  } | null
  dayOfWeek: number
  timeSlot: EcaTimeSlot
  customStartTime?: string | null
  customEndTime?: string | null
  location?: string | null
  activityType: EcaActivityType
  eligibleYearGroupIds: string[]
  eligibleGender: EcaGender
  minCapacity?: number | null
  maxCapacity?: number | null
  staffId?: string | null
  staff?: {
    id: string
    name: string
  } | null
  isActive: boolean
  isCancelled: boolean
  cancelReason?: string | null
  createdAt: string
  updatedAt: string
  // Computed fields
  currentEnrollment?: number
  waitlistCount?: number
  selectionCount?: number
}

export interface EcaSelection {
  id: string
  ecaTermId: string
  studentId: string
  parentUserId: string
  ecaActivityId: string
  rank: number
  isPriority: boolean
  createdAt: string
  updatedAt: string
  // Populated fields
  student?: {
    id: string
    firstName: string
    lastName: string
    className: string
  }
  ecaActivity?: EcaActivity
}

export interface EcaAllocation {
  id: string
  ecaTermId: string
  studentId: string
  ecaActivityId: string
  allocationType: EcaAllocationType
  allocationRound?: number | null
  status: EcaAllocationStatus
  createdAt: string
  updatedAt: string
  // Populated fields
  student?: {
    id: string
    firstName: string
    lastName: string
    className: string
  }
  ecaActivity?: EcaActivity
}

export interface EcaWaitlist {
  id: string
  ecaTermId: string
  studentId: string
  ecaActivityId: string
  position: number
  createdAt: string
  // Populated fields
  student?: {
    id: string
    firstName: string
    lastName: string
    className: string
  }
}

export interface EcaInvitation {
  id: string
  ecaActivityId: string
  studentId: string
  status: EcaInvitationStatus
  invitedById: string
  isTryout: boolean
  tryoutResult?: EcaTryoutResult | null
  createdAt: string
  updatedAt: string
  // Populated fields
  student?: {
    id: string
    firstName: string
    lastName: string
    className: string
  }
  ecaActivity?: EcaActivity
  invitedBy?: {
    id: string
    name: string
  }
}

export interface EcaAttendance {
  id: string
  ecaTermId: string
  ecaActivityId: string
  studentId: string
  sessionDate: string
  status: EcaAttendanceStatus
  note?: string | null
  markedById?: string | null
  createdAt: string
  updatedAt: string
  // Populated fields
  student?: {
    id: string
    firstName: string
    lastName: string
  }
  markedBy?: {
    id: string
    name: string
  }
}

// API Response types
export interface EcaTermListResponse {
  terms: EcaTerm[]
}

export interface EcaActivityListResponse {
  activities: EcaActivity[]
}

export interface EcaAllocationPreview {
  activities: Array<{
    activityId: string
    activityName: string
    allocations: number
    waitlist: number
    belowMinimum: boolean
    willBeCancelled: boolean
    minCapacity: number | null
  }>
  totalAllocations: number
  totalWaitlist: number
  activitiesToCancel: number
  selectionMode: EcaSelectionMode
  defaultSelectionMode: EcaSelectionMode
}

export interface EcaAllocationResult {
  success: boolean
  allocations: number
  totalAllocations: number
  totalStudents: number
  waitlisted: number
  cancelledActivities: number
  cancelledActivityNames?: string[]
  errors?: string[]

  // Satisfaction metrics (smart allocation only)
  firstChoiceAllocations?: number
  secondChoiceAllocations?: number
  thirdChoiceAllocations?: number
  forcedAllocations?: number  // Assigned to non-selected activities

  // Unallocated students (for manual intervention)
  unallocatedStudents?: Array<{
    studentId: string
    studentName: string
    className: string
    unallocatedSlots: Array<{
      dayOfWeek: number
      timeSlot: EcaTimeSlot
      requestedActivities: string[]
      reason: 'ALL_FULL' | 'CANCELLED' | 'NO_ELIGIBLE_ACTIVITIES'
    }>
  }>

  // Activities at risk of cancellation
  activitiesAtRisk?: Array<{
    activityId: string
    activityName: string
    currentEnrollment: number
    minCapacity: number
    shortfall: number
  }>
}

export interface EcaAllocationOptions {
  selectionMode?: EcaSelectionMode
  cancelBelowMinimum?: boolean
}

// Parent-specific types
export interface ParentEcaTerm extends EcaTerm {
  activities: ParentEcaActivity[]
}

export interface ParentEcaActivity extends EcaActivity {
  isEligible: boolean
  eligibilityReason?: string | null
  currentlySelected: boolean
  selectedRank?: number | null
  isPrioritySelected: boolean
  availableSpots?: number | null // null if unlimited
  hasInvitation?: boolean
  invitationId?: string | null
}

export interface ParentEcaSelections {
  termId: string
  studentId: string
  studentName: string
  selections: Array<{
    activityId: string
    activityName: string
    dayOfWeek: number
    timeSlot: EcaTimeSlot
    rank: number
    isPriority: boolean
  }>
}

export interface ParentEcaAllocations {
  studentId: string
  studentName: string
  allocations: Array<{
    activityId: string
    activityName: string
    dayOfWeek: number
    timeSlot: EcaTimeSlot
    location?: string | null
    startTime?: string | null
    endTime?: string | null
    staffName?: string | null
    status: EcaAllocationStatus
  }>
}

// Selection submission types
export interface EcaSelectionSubmission {
  studentId: string
  selections: Array<{
    activityId: string
    rank: number
    isPriority: boolean
  }>
}

// Attendance types
export interface EcaAttendanceSession {
  date: string
  students: Array<{
    studentId: string
    studentName: string
    status?: EcaAttendanceStatus
    note?: string
  }>
}

export interface EcaAttendanceMarkRequest {
  sessionDate: string
  records: Array<{
    studentId: string
    status: EcaAttendanceStatus
    note?: string
  }>
}
