import prisma from './prisma.js'
import type { EcaAllocationType, EcaSelectionMode } from '@prisma/client'

interface AllocationOptions {
  selectionMode?: 'FIRST_COME_FIRST_SERVED' | 'SMART_ALLOCATION'
  cancelBelowMinimum?: boolean
}

// Enhanced result interface with satisfaction metrics
interface SmartAllocationResult {
  success: boolean
  allocations: number
  totalAllocations: number
  totalStudents: number
  waitlisted: number
  cancelledActivities: number
  cancelledActivityNames: string[]
  errors: string[]

  // Satisfaction metrics
  firstChoiceAllocations: number
  secondChoiceAllocations: number
  thirdChoiceAllocations: number
  forcedAllocations: number  // Assigned to non-selected activities

  // Unallocated students (for manual intervention)
  unallocatedStudents: Array<{
    studentId: string
    studentName: string
    className: string
    unallocatedSlots: Array<{
      dayOfWeek: number
      timeSlot: string
      requestedActivities: string[]
      reason: 'ALL_FULL' | 'CANCELLED' | 'NO_ELIGIBLE_ACTIVITIES'
    }>
  }>

  // Activities at risk of cancellation
  activitiesAtRisk: Array<{
    activityId: string
    activityName: string
    currentEnrollment: number
    minCapacity: number
    shortfall: number
  }>

  // Suggestions for improvement
  suggestions: Array<{
    type: 'INCREASE_CAPACITY' | 'DECREASE_MINIMUM' | 'ADD_SESSION' | 'MANUAL_PLACEMENT' | 'REVIEW_ACTIVITY'
    priority: 'HIGH' | 'MEDIUM' | 'LOW'
    title: string
    description: string
    activityId?: string
    activityName?: string
    currentValue?: number
    suggestedValue?: number
    affectedCount?: number
  }>
}

interface AllocationPreview {
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
  selectionMode: 'FIRST_COME_FIRST_SERVED' | 'SMART_ALLOCATION'
  defaultSelectionMode: 'FIRST_COME_FIRST_SERVED' | 'SMART_ALLOCATION'
}

interface SelectionWithDetails {
  id: string
  ecaTermId: string
  studentId: string
  parentUserId: string
  ecaActivityId: string
  rank: number
  isPriority: boolean
  createdAt: Date
  student: {
    id: string
    firstName: string
    lastName: string
    classId: string
    class?: { name: string; yearGroupId?: string | null } | null
  }
  ecaActivity: {
    id: string
    name: string
    dayOfWeek: number
    timeSlot: 'BEFORE_SCHOOL' | 'AFTER_SCHOOL'
    maxCapacity: number | null
    minCapacity: number | null
    activityType: 'OPEN' | 'INVITE_ONLY' | 'COMPULSORY' | 'TRYOUT'
    eligibleYearGroupIds: string[]
    eligibleGender: 'MIXED' | 'BOYS_ONLY' | 'GIRLS_ONLY'
  }
}

interface ActivityWithDetails {
  id: string
  name: string
  dayOfWeek: number
  timeSlot: 'BEFORE_SCHOOL' | 'AFTER_SCHOOL'
  maxCapacity: number | null
  minCapacity: number | null
  activityType: 'OPEN' | 'INVITE_ONLY' | 'COMPULSORY' | 'TRYOUT'
  eligibleYearGroupIds: any
  eligibleGender: 'MIXED' | 'BOYS_ONLY' | 'GIRLS_ONLY'
  isCancelled: boolean
  isActive: boolean
}

// Track allocations per student per day/timeslot
interface StudentSlotMap {
  [studentId: string]: {
    [dayTimeSlot: string]: string // activityId
  }
}

// Track current enrollment per activity
interface ActivityEnrollmentMap {
  [activityId: string]: string[] // studentIds
}

// Activity demand classification
type DemandLevel = 'AT_RISK' | 'LOW_DEMAND' | 'BALANCED' | 'HIGH_DEMAND' | 'OVERSUBSCRIBED'

interface ActivityDemand {
  activityId: string
  demandLevel: DemandLevel
  totalSelections: number
  minCapacity: number
  maxCapacity: number
}

// Default capacities
const DEFAULT_MAX_CAPACITY = 25
const DEFAULT_MIN_CAPACITY = 8
const LARGE_ACTIVITY_MAX_CAPACITY = 100 // For Choir/Dance activities

/**
 * Run the ECA allocation algorithm for a term
 */
export async function runAllocation(ecaTermId: string, schoolId: string, options: AllocationOptions = {}): Promise<SmartAllocationResult> {
  const result: SmartAllocationResult = {
    success: false,
    allocations: 0,
    totalAllocations: 0,
    totalStudents: 0,
    waitlisted: 0,
    cancelledActivities: 0,
    cancelledActivityNames: [],
    errors: [],
    firstChoiceAllocations: 0,
    secondChoiceAllocations: 0,
    thirdChoiceAllocations: 0,
    forcedAllocations: 0,
    unallocatedStudents: [],
    activitiesAtRisk: [],
    suggestions: [],
  }

  try {
    // Get ECA settings for the school
    const settings = await prisma.ecaSettings.findUnique({
      where: { schoolId },
    })

    // Use provided selectionMode option, or fall back to school settings
    const selectionMode: EcaSelectionMode = options.selectionMode || settings?.selectionMode || 'FIRST_COME_FIRST_SERVED'

    // Default to cancelling below minimum unless explicitly set to false
    const cancelBelowMinimum = options.cancelBelowMinimum !== false

    // Get all activities for this term with full details
    const activities = await prisma.ecaActivity.findMany({
      where: {
        ecaTermId,
        isActive: true,
        isCancelled: false,
      },
    }) as ActivityWithDetails[]

    // Get all selections for this term with student details
    const selections = await prisma.ecaSelection.findMany({
      where: { ecaTermId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            classId: true,
            class: { select: { name: true, yearGroupId: true } },
          },
        },
        ecaActivity: {
          select: {
            id: true,
            name: true,
            dayOfWeek: true,
            timeSlot: true,
            maxCapacity: true,
            minCapacity: true,
            activityType: true,
            eligibleYearGroupIds: true,
            eligibleGender: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }) as SelectionWithDetails[]

    // Handle existing allocations (compulsory, invited)
    const existingAllocations = await prisma.ecaAllocation.findMany({
      where: { ecaTermId, status: 'CONFIRMED' },
    })

    // Initialize tracking structures
    const studentSlots: StudentSlotMap = {}
    const activityEnrollment: ActivityEnrollmentMap = {}

    // Initialize activity enrollment map
    for (const activity of activities) {
      activityEnrollment[activity.id] = []
    }

    // Process existing allocations
    for (const allocation of existingAllocations) {
      const activity = activities.find(a => a.id === allocation.ecaActivityId)
      if (!activity) continue

      const slotKey = `${activity.dayOfWeek}-${activity.timeSlot}`
      if (!studentSlots[allocation.studentId]) {
        studentSlots[allocation.studentId] = {}
      }
      studentSlots[allocation.studentId][slotKey] = allocation.ecaActivityId
      if (activityEnrollment[allocation.ecaActivityId]) {
        activityEnrollment[allocation.ecaActivityId].push(allocation.studentId)
      }
    }

    // Clear previous allocation results (but keep COMPULSORY and INVITED)
    await prisma.ecaAllocation.deleteMany({
      where: {
        ecaTermId,
        allocationType: { in: ['FIRST_COME', 'SMART_PRIORITY', 'SMART_RANKED', 'SMART_REALLOCATION', 'SMART_FORCED'] },
      },
    })

    // Clear previous waitlist
    await prisma.ecaWaitlist.deleteMany({
      where: { ecaTermId },
    })

    // Count unique students
    const uniqueStudentIds = new Set(selections.map(s => s.studentId))
    result.totalStudents = uniqueStudentIds.size

    // Run allocation based on mode
    if (selectionMode === 'FIRST_COME_FIRST_SERVED') {
      await runFirstComeFirstServed(
        ecaTermId,
        selections,
        activities,
        studentSlots,
        activityEnrollment,
        result
      )
    } else {
      await runGaleShapleySmartAllocation(
        ecaTermId,
        selections,
        activities,
        studentSlots,
        activityEnrollment,
        result
      )
    }

    // Check minimum capacity and cancel under-enrolled activities (if enabled)
    if (cancelBelowMinimum) {
      for (const activity of activities) {
        const minCap = activity.minCapacity ?? DEFAULT_MIN_CAPACITY
        const currentEnrollment = activityEnrollment[activity.id]?.length || 0

        if (currentEnrollment < minCap) {
          // Cancel the activity
          await prisma.ecaActivity.update({
            where: { id: activity.id },
            data: {
              isCancelled: true,
              cancelReason: `Minimum capacity of ${minCap} not met (${currentEnrollment} enrolled)`,
            },
          })

          // Remove allocations for this activity
          await prisma.ecaAllocation.deleteMany({
            where: { ecaActivityId: activity.id },
          })

          // Try to reallocate affected students to their backup choices
          const affectedStudentIds = activityEnrollment[activity.id] || []
          await reallocateStudents(
            ecaTermId,
            affectedStudentIds,
            activity.id,
            selections,
            activities,
            studentSlots,
            activityEnrollment,
            result
          )

          result.cancelledActivities++
          result.cancelledActivityNames.push(activity.name)
        }
      }
    }

    // Check for activities at risk (below minimum but not cancelled yet)
    for (const activity of activities) {
      if (activity.isCancelled) continue
      const minCap = activity.minCapacity ?? DEFAULT_MIN_CAPACITY
      const currentEnrollment = activityEnrollment[activity.id]?.length || 0

      if (currentEnrollment < minCap && currentEnrollment > 0) {
        result.activitiesAtRisk.push({
          activityId: activity.id,
          activityName: activity.name,
          currentEnrollment,
          minCapacity: minCap,
          shortfall: minCap - currentEnrollment,
        })
      }
    }

    // Update term status to ALLOCATION_COMPLETE
    await prisma.ecaTerm.update({
      where: { id: ecaTermId },
      data: { allocationRun: true, status: 'ALLOCATION_COMPLETE' },
    })

    // Generate suggestions for improvement
    generateSuggestions(result, selections, activities, activityEnrollment)

    result.totalAllocations = result.allocations
    result.success = true
  } catch (error: any) {
    result.errors.push(error.message || 'Unknown error during allocation')
    console.error('Allocation error:', error)
  }

  return result
}

/**
 * First Come First Served allocation
 */
async function runFirstComeFirstServed(
  ecaTermId: string,
  selections: SelectionWithDetails[],
  activities: ActivityWithDetails[],
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  result: SmartAllocationResult
): Promise<void> {
  // Process selections in order of submission time
  for (const selection of selections) {
    const activity = selection.ecaActivity
    const slotKey = `${activity.dayOfWeek}-${activity.timeSlot}`

    // Skip if student already has an activity in this slot
    if (studentSlots[selection.studentId]?.[slotKey]) {
      continue
    }

    // Get effective max capacity
    const maxCap = getEffectiveMaxCapacity(activity)

    // Check capacity
    const currentEnrollment = activityEnrollment[activity.id]?.length || 0
    if (currentEnrollment >= maxCap) {
      // Add to waitlist
      await addToWaitlist(ecaTermId, selection.studentId, activity.id, result)
      continue
    }

    // Allocate
    await createAllocation(
      ecaTermId,
      selection.studentId,
      activity.id,
      'FIRST_COME',
      null,
      1,
      studentSlots,
      activityEnrollment,
      slotKey,
      result
    )
    result.firstChoiceAllocations++
  }
}

/**
 * Gale-Shapley (Deferred Acceptance) Smart Allocation Algorithm
 *
 * Goals:
 * 1. Coverage first - Every student gets an activity on every day they selected
 * 2. Satisfaction second - Maximize 1st choice allocations within coverage constraint
 * 3. Fairness third - Randomization ensures no systematic bias
 */
async function runGaleShapleySmartAllocation(
  ecaTermId: string,
  selections: SelectionWithDetails[],
  activities: ActivityWithDetails[],
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  result: SmartAllocationResult
): Promise<void> {
  // Phase 1: Demand Analysis
  const demandAnalysis = analyzeActivityDemand(selections, activities)

  // Group selections by day/timeslot for processing
  const slotSelections = groupSelectionsBySlot(selections)

  // Process each day/timeslot independently
  for (const [slotKey, slotData] of Object.entries(slotSelections)) {
    await processSlotWithGaleShapley(
      ecaTermId,
      slotKey,
      slotData.selections,
      slotData.activities,
      activities,
      studentSlots,
      activityEnrollment,
      demandAnalysis,
      result
    )
  }

  // Track unallocated students
  trackUnallocatedStudents(selections, studentSlots, activities, result)
}

/**
 * Analyze demand for each activity
 */
function analyzeActivityDemand(
  selections: SelectionWithDetails[],
  activities: ActivityWithDetails[]
): Map<string, ActivityDemand> {
  const demandMap = new Map<string, ActivityDemand>()

  for (const activity of activities) {
    const activitySelections = selections.filter(s => s.ecaActivityId === activity.id)
    const totalSelections = activitySelections.length
    const minCap = activity.minCapacity ?? DEFAULT_MIN_CAPACITY
    const maxCap = getEffectiveMaxCapacity(activity)

    let demandLevel: DemandLevel
    if (totalSelections < minCap) {
      demandLevel = 'AT_RISK'
    } else if (totalSelections < maxCap * 0.5) {
      demandLevel = 'LOW_DEMAND'
    } else if (totalSelections <= maxCap) {
      demandLevel = 'BALANCED'
    } else if (totalSelections <= maxCap * 1.5) {
      demandLevel = 'HIGH_DEMAND'
    } else {
      demandLevel = 'OVERSUBSCRIBED'
    }

    demandMap.set(activity.id, {
      activityId: activity.id,
      demandLevel,
      totalSelections,
      minCapacity: minCap,
      maxCapacity: maxCap,
    })
  }

  return demandMap
}

/**
 * Group selections by day/timeslot
 */
function groupSelectionsBySlot(selections: SelectionWithDetails[]): Record<string, {
  selections: SelectionWithDetails[]
  activities: Set<string>
}> {
  const slotSelections: Record<string, {
    selections: SelectionWithDetails[]
    activities: Set<string>
  }> = {}

  for (const selection of selections) {
    const slotKey = `${selection.ecaActivity.dayOfWeek}-${selection.ecaActivity.timeSlot}`
    if (!slotSelections[slotKey]) {
      slotSelections[slotKey] = { selections: [], activities: new Set() }
    }
    slotSelections[slotKey].selections.push(selection)
    slotSelections[slotKey].activities.add(selection.ecaActivityId)
  }

  return slotSelections
}

/**
 * Process a single day/timeslot using Gale-Shapley algorithm
 */
async function processSlotWithGaleShapley(
  ecaTermId: string,
  slotKey: string,
  slotSelections: SelectionWithDetails[],
  slotActivityIds: Set<string>,
  allActivities: ActivityWithDetails[],
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  demandAnalysis: Map<string, ActivityDemand>,
  result: SmartAllocationResult
): Promise<void> {
  // Get activities for this slot
  const slotActivities = allActivities.filter(a => slotActivityIds.has(a.id) && !a.isCancelled)

  // Separate priority and regular selections
  const prioritySelections = slotSelections.filter(s => s.isPriority)
  const regularSelections = slotSelections.filter(s => !s.isPriority)

  // Phase 2a: Priority Pass - Allocate priority students first (guaranteed)
  for (const selection of prioritySelections) {
    // Skip if student already has an activity in this slot
    if (studentSlots[selection.studentId]?.[slotKey]) continue

    const maxCap = getEffectiveMaxCapacity(selection.ecaActivity)
    const currentEnrollment = activityEnrollment[selection.ecaActivityId]?.length || 0

    if (currentEnrollment >= maxCap) {
      await addToWaitlist(ecaTermId, selection.studentId, selection.ecaActivityId, result)
      continue
    }

    await createAllocation(
      ecaTermId,
      selection.studentId,
      selection.ecaActivityId,
      'SMART_PRIORITY',
      1,
      1,
      studentSlots,
      activityEnrollment,
      slotKey,
      result
    )
    result.firstChoiceAllocations++
  }

  // Phase 2b: Build student preference lists for Gale-Shapley
  const studentPreferences = buildStudentPreferences(regularSelections, slotActivities, studentSlots, slotKey)

  // Phase 2c: Run Gale-Shapley (Student-Proposing Deferred Acceptance)
  await runDeferredAcceptance(
    ecaTermId,
    studentPreferences,
    slotActivities,
    studentSlots,
    activityEnrollment,
    demandAnalysis,
    slotKey,
    result
  )
}

interface StudentPreference {
  studentId: string
  studentName: string
  className: string
  preferences: Array<{
    activityId: string
    rank: number  // 1-3 for explicit choices, 99 for forced/extended
    isForced: boolean
  }>
  currentProposalIndex: number
}

/**
 * Build student preference lists
 * Includes explicit choices (rank 1-3) plus any eligible activities as extended preferences
 */
function buildStudentPreferences(
  selections: SelectionWithDetails[],
  slotActivities: ActivityWithDetails[],
  studentSlots: StudentSlotMap,
  slotKey: string
): Map<string, StudentPreference> {
  const preferences = new Map<string, StudentPreference>()

  // Group selections by student
  const studentSelections = new Map<string, SelectionWithDetails[]>()
  for (const selection of selections) {
    if (!studentSelections.has(selection.studentId)) {
      studentSelections.set(selection.studentId, [])
    }
    studentSelections.get(selection.studentId)!.push(selection)
  }

  // Build preference list for each student
  for (const [studentId, studentSels] of studentSelections) {
    // Skip if student already has an activity in this slot
    if (studentSlots[studentId]?.[slotKey]) continue

    const firstSel = studentSels[0]
    const studentName = `${firstSel.student.firstName} ${firstSel.student.lastName}`
    const className = firstSel.student.class?.name || 'Unknown'

    // Sort explicit selections by rank
    const sortedSelections = [...studentSels].sort((a, b) => a.rank - b.rank)

    const prefList: StudentPreference['preferences'] = []
    const addedActivityIds = new Set<string>()

    // Add explicit choices (rank 1, 2, 3)
    for (const sel of sortedSelections) {
      if (!addedActivityIds.has(sel.ecaActivityId)) {
        prefList.push({
          activityId: sel.ecaActivityId,
          rank: sel.rank,
          isForced: false,
        })
        addedActivityIds.add(sel.ecaActivityId)
      }
    }

    // Add extended preferences (any eligible activity not yet chosen)
    // This ensures coverage - every student gets an activity
    const eligibleExtensions = slotActivities.filter(activity => {
      if (addedActivityIds.has(activity.id)) return false
      if (activity.isCancelled) return false
      if (activity.activityType === 'INVITE_ONLY' || activity.activityType === 'TRYOUT') return false

      // Check eligibility
      return isStudentEligible(firstSel.student, activity)
    })

    // Shuffle extended preferences for fairness
    const shuffledExtensions = shuffleArray([...eligibleExtensions])
    for (const activity of shuffledExtensions) {
      prefList.push({
        activityId: activity.id,
        rank: 99,
        isForced: true,
      })
    }

    preferences.set(studentId, {
      studentId,
      studentName,
      className,
      preferences: prefList,
      currentProposalIndex: 0,
    })
  }

  return preferences
}

/**
 * Check if a student is eligible for an activity
 */
function isStudentEligible(student: SelectionWithDetails['student'], activity: ActivityWithDetails): boolean {
  // Check year group eligibility
  const eligibleYearGroups = parseEligibleYearGroups(activity.eligibleYearGroupIds)
  const studentYearGroupId = student.class?.yearGroupId
  if (eligibleYearGroups.length > 0 && studentYearGroupId) {
    if (!eligibleYearGroups.includes(studentYearGroupId)) {
      return false
    }
  }

  // Note: Gender restrictions are defined in activity.eligibleGender but
  // the Student model doesn't have a gender field in the current schema.
  // For now, we skip gender eligibility checks. If gender tracking is added
  // to the Student model later, this can be enabled.

  return true
}

/**
 * Parse eligible year group IDs from JSON field
 */
function parseEligibleYearGroups(eligibleYearGroupIds: any): string[] {
  if (!eligibleYearGroupIds) return []
  if (Array.isArray(eligibleYearGroupIds)) return eligibleYearGroupIds
  if (typeof eligibleYearGroupIds === 'string') {
    try {
      const parsed = JSON.parse(eligibleYearGroupIds)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

interface ActivityMatchState {
  activityId: string
  tentativeMatches: Array<{
    studentId: string
    preferenceRank: number
    isPriority: boolean
  }>
  maxCapacity: number
}

/**
 * Run Gale-Shapley Deferred Acceptance Algorithm (Student-Proposing)
 *
 * Students "propose" to activities in order of preference.
 * Activities tentatively accept up to maxCapacity, preferring priority students first, then by random.
 * Rejected students continue to propose to their next preference.
 */
async function runDeferredAcceptance(
  ecaTermId: string,
  studentPreferences: Map<string, StudentPreference>,
  slotActivities: ActivityWithDetails[],
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  demandAnalysis: Map<string, ActivityDemand>,
  slotKey: string,
  result: SmartAllocationResult
): Promise<void> {
  // Initialize activity match state
  const activityStates = new Map<string, ActivityMatchState>()
  for (const activity of slotActivities) {
    const existingEnrollment = activityEnrollment[activity.id]?.length || 0
    activityStates.set(activity.id, {
      activityId: activity.id,
      tentativeMatches: [],
      maxCapacity: getEffectiveMaxCapacity(activity) - existingEnrollment,
    })
  }

  // Track unmatched students
  const unmatchedStudents = new Set(studentPreferences.keys())

  // Deferred Acceptance loop
  let iterationCount = 0
  const maxIterations = studentPreferences.size * 100 // Safety limit

  while (unmatchedStudents.size > 0 && iterationCount < maxIterations) {
    iterationCount++
    let anyProposal = false

    for (const studentId of unmatchedStudents) {
      const pref = studentPreferences.get(studentId)!

      // Get next activity to propose to
      while (pref.currentProposalIndex < pref.preferences.length) {
        const nextPref = pref.preferences[pref.currentProposalIndex]
        const activityState = activityStates.get(nextPref.activityId)

        if (!activityState) {
          pref.currentProposalIndex++
          continue
        }

        anyProposal = true

        // Student proposes to this activity
        const demand = demandAnalysis.get(nextPref.activityId)
        const atRiskBoost = demand?.demandLevel === 'AT_RISK' ? 1 : 0

        activityState.tentativeMatches.push({
          studentId,
          preferenceRank: nextPref.rank - atRiskBoost, // Lower rank = higher priority
          isPriority: false,
        })

        pref.currentProposalIndex++
        break
      }
    }

    if (!anyProposal) break

    // Activities accept/reject
    for (const activityState of activityStates.values()) {
      if (activityState.tentativeMatches.length <= activityState.maxCapacity) {
        // All matches accepted
        continue
      }

      // Sort by priority then by random (shuffle first, then stable sort)
      const shuffled = shuffleArray([...activityState.tentativeMatches])
      shuffled.sort((a, b) => a.preferenceRank - b.preferenceRank)

      // Keep top maxCapacity students
      const accepted = shuffled.slice(0, activityState.maxCapacity)
      const rejected = shuffled.slice(activityState.maxCapacity)

      activityState.tentativeMatches = accepted

      // Rejected students go back to unmatched
      for (const match of rejected) {
        if (studentPreferences.has(match.studentId)) {
          unmatchedStudents.add(match.studentId)
        }
      }
    }

    // Remove matched students from unmatched set
    for (const activityState of activityStates.values()) {
      for (const match of activityState.tentativeMatches) {
        unmatchedStudents.delete(match.studentId)
      }
    }
  }

  // Finalize allocations
  for (const activityState of activityStates.values()) {
    for (const match of activityState.tentativeMatches) {
      const pref = studentPreferences.get(match.studentId)
      if (!pref) continue

      // Find the preference that was matched
      const matchedPref = pref.preferences.find(p => p.activityId === activityState.activityId)
      if (!matchedPref) continue

      // Determine allocation type based on rank
      let allocationType: EcaAllocationType
      if (matchedPref.isForced) {
        allocationType = 'SMART_FORCED'
        result.forcedAllocations++
      } else {
        allocationType = 'SMART_RANKED'
        switch (matchedPref.rank) {
          case 1:
            result.firstChoiceAllocations++
            break
          case 2:
            result.secondChoiceAllocations++
            break
          case 3:
            result.thirdChoiceAllocations++
            break
          default:
            result.forcedAllocations++
        }
      }

      await createAllocation(
        ecaTermId,
        match.studentId,
        activityState.activityId,
        allocationType,
        matchedPref.rank <= 3 ? matchedPref.rank + 1 : 99, // Round number
        matchedPref.rank,
        studentSlots,
        activityEnrollment,
        slotKey,
        result
      )
    }
  }

  // Add unmatched students to waitlist for their first choice
  for (const studentId of unmatchedStudents) {
    const pref = studentPreferences.get(studentId)
    if (pref && pref.preferences.length > 0) {
      const firstChoice = pref.preferences[0]
      await addToWaitlist(ecaTermId, studentId, firstChoice.activityId, result)
    }
  }
}

/**
 * Track students who couldn't be placed in any activity
 */
function trackUnallocatedStudents(
  selections: SelectionWithDetails[],
  studentSlots: StudentSlotMap,
  activities: ActivityWithDetails[],
  result: SmartAllocationResult
): void {
  // Group selections by student
  const studentSelections = new Map<string, SelectionWithDetails[]>()
  for (const selection of selections) {
    if (!studentSelections.has(selection.studentId)) {
      studentSelections.set(selection.studentId, [])
    }
    studentSelections.get(selection.studentId)!.push(selection)
  }

  // Check each student's selections
  for (const [studentId, studentSels] of studentSelections) {
    const unallocatedSlots: SmartAllocationResult['unallocatedStudents'][0]['unallocatedSlots'] = []

    // Group by slot
    const slotRequests = new Map<string, SelectionWithDetails[]>()
    for (const sel of studentSels) {
      const slotKey = `${sel.ecaActivity.dayOfWeek}-${sel.ecaActivity.timeSlot}`
      if (!slotRequests.has(slotKey)) {
        slotRequests.set(slotKey, [])
      }
      slotRequests.get(slotKey)!.push(sel)
    }

    // Check each slot
    for (const [slotKey, slotSels] of slotRequests) {
      if (studentSlots[studentId]?.[slotKey]) {
        // Student has allocation for this slot
        continue
      }

      // Determine reason for non-allocation
      const requestedActivities = slotSels.map(s => s.ecaActivity.name)
      const [dayOfWeek, timeSlot] = slotKey.split('-')

      // Check if all requested activities are full or cancelled
      const allFull = slotSels.every(sel => {
        const activity = activities.find(a => a.id === sel.ecaActivityId)
        if (!activity) return true
        if (activity.isCancelled) return true
        return false
      })

      let reason: 'ALL_FULL' | 'CANCELLED' | 'NO_ELIGIBLE_ACTIVITIES' = 'ALL_FULL'
      if (slotSels.some(s => activities.find(a => a.id === s.ecaActivityId)?.isCancelled)) {
        reason = 'CANCELLED'
      }

      unallocatedSlots.push({
        dayOfWeek: parseInt(dayOfWeek),
        timeSlot,
        requestedActivities,
        reason,
      })
    }

    if (unallocatedSlots.length > 0) {
      const firstSel = studentSels[0]
      result.unallocatedStudents.push({
        studentId,
        studentName: `${firstSel.student.firstName} ${firstSel.student.lastName}`,
        className: firstSel.student.class?.name || 'Unknown',
        unallocatedSlots,
      })
    }
  }
}

/**
 * Reallocate students from cancelled activities to their backup choices
 */
async function reallocateStudents(
  ecaTermId: string,
  studentIds: string[],
  cancelledActivityId: string,
  selections: SelectionWithDetails[],
  activities: ActivityWithDetails[],
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  result: SmartAllocationResult
): Promise<void> {
  for (const studentId of studentIds) {
    // Clear the slot for this student
    const cancelledActivity = activities.find(a => a.id === cancelledActivityId)
    if (!cancelledActivity) continue

    const cancelledSlotKey = `${cancelledActivity.dayOfWeek}-${cancelledActivity.timeSlot}`

    // Remove from student slots
    if (studentSlots[studentId]) {
      delete studentSlots[studentId][cancelledSlotKey]
    }

    // Find student's other selections for the same day/slot
    const studentSelections = selections
      .filter(s => s.studentId === studentId && s.ecaActivityId !== cancelledActivityId)
      .sort((a, b) => a.rank - b.rank)

    for (const selection of studentSelections) {
      const activity = selection.ecaActivity
      const slotKey = `${activity.dayOfWeek}-${activity.timeSlot}`

      // Check if this is for the same slot as cancelled activity
      if (slotKey !== cancelledSlotKey) continue

      // Check if activity is still available
      const fullActivity = activities.find(a => a.id === activity.id)
      if (!fullActivity || fullActivity.isCancelled) continue

      // Check capacity
      const maxCap = getEffectiveMaxCapacity(activity)
      const currentEnrollment = activityEnrollment[activity.id]?.length || 0
      if (currentEnrollment >= maxCap) {
        continue
      }

      // Reallocate
      await createAllocation(
        ecaTermId,
        studentId,
        activity.id,
        'SMART_REALLOCATION',
        null,
        selection.rank,
        studentSlots,
        activityEnrollment,
        slotKey,
        result
      )
      break
    }
  }
}

/**
 * Get effective max capacity for an activity
 */
function getEffectiveMaxCapacity(activity: { maxCapacity: number | null; name?: string }): number {
  if (activity.maxCapacity !== null) return activity.maxCapacity

  // Check for large activity types (Choir, Dance, etc.)
  const name = activity.name?.toLowerCase() || ''
  if (name.includes('choir') || name.includes('dance') || name.includes('orchestra')) {
    return LARGE_ACTIVITY_MAX_CAPACITY
  }

  return DEFAULT_MAX_CAPACITY
}

async function createAllocation(
  ecaTermId: string,
  studentId: string,
  activityId: string,
  allocationType: EcaAllocationType,
  round: number | null,
  rank: number,
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  slotKey: string,
  result: SmartAllocationResult
): Promise<void> {
  try {
    await prisma.ecaAllocation.create({
      data: {
        ecaTermId,
        studentId,
        ecaActivityId: activityId,
        allocationType,
        allocationRound: round,
        status: 'CONFIRMED',
      },
    })

    // Update tracking structures
    if (!studentSlots[studentId]) {
      studentSlots[studentId] = {}
    }
    studentSlots[studentId][slotKey] = activityId

    if (!activityEnrollment[activityId]) {
      activityEnrollment[activityId] = []
    }
    activityEnrollment[activityId].push(studentId)

    result.allocations++
  } catch (error: any) {
    // Handle unique constraint violation (student already allocated to this activity)
    if (error.code === 'P2002') {
      // Already allocated, skip
      return
    }
    throw error
  }
}

async function addToWaitlist(
  ecaTermId: string,
  studentId: string,
  activityId: string,
  result: SmartAllocationResult
): Promise<void> {
  try {
    // Get current max position for this activity
    const maxPosition = await prisma.ecaWaitlist.findFirst({
      where: { ecaActivityId: activityId },
      orderBy: { position: 'desc' },
      select: { position: true },
    })

    await prisma.ecaWaitlist.create({
      data: {
        ecaTermId,
        studentId,
        ecaActivityId: activityId,
        position: (maxPosition?.position || 0) + 1,
      },
    })

    result.waitlisted++
  } catch (error: any) {
    // Handle unique constraint violation (student already on waitlist)
    if (error.code === 'P2002') {
      return
    }
    throw error
  }
}

/**
 * Preview allocation results without committing
 */
export async function previewAllocation(ecaTermId: string, schoolId: string, selectionModeOverride?: 'FIRST_COME_FIRST_SERVED' | 'SMART_ALLOCATION'): Promise<AllocationPreview> {
  const settings = await prisma.ecaSettings.findUnique({
    where: { schoolId },
  })

  const activities = await prisma.ecaActivity.findMany({
    where: {
      ecaTermId,
      isActive: true,
      isCancelled: false,
    },
  })

  const selections = await prisma.ecaSelection.findMany({
    where: { ecaTermId },
    include: {
      ecaActivity: {
        select: { id: true, dayOfWeek: true, timeSlot: true, maxCapacity: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Simulate allocation
  const activityEnrollment: ActivityEnrollmentMap = {}
  const studentSlots: StudentSlotMap = {}

  for (const activity of activities) {
    activityEnrollment[activity.id] = []
  }

  const waitlistCounts: { [activityId: string]: number } = {}

  // Simple simulation based on mode (use override if provided)
  const selectionMode = selectionModeOverride || settings?.selectionMode || 'FIRST_COME_FIRST_SERVED'

  if (selectionMode === 'FIRST_COME_FIRST_SERVED') {
    for (const selection of selections) {
      const slotKey = `${selection.ecaActivity.dayOfWeek}-${selection.ecaActivity.timeSlot}`

      if (studentSlots[selection.studentId]?.[slotKey]) continue

      const maxCap = selection.ecaActivity.maxCapacity ?? DEFAULT_MAX_CAPACITY
      if (activityEnrollment[selection.ecaActivityId].length >= maxCap) {
        waitlistCounts[selection.ecaActivityId] = (waitlistCounts[selection.ecaActivityId] || 0) + 1
        continue
      }

      if (!studentSlots[selection.studentId]) {
        studentSlots[selection.studentId] = {}
      }
      studentSlots[selection.studentId][slotKey] = selection.ecaActivityId
      activityEnrollment[selection.ecaActivityId].push(selection.studentId)
    }
  } else {
    // Smart allocation simulation (simplified)
    const prioritySelections = selections.filter(s => s.isPriority)
    const rank1 = selections.filter(s => !s.isPriority && s.rank === 1)

    for (const selection of [...prioritySelections, ...rank1]) {
      const slotKey = `${selection.ecaActivity.dayOfWeek}-${selection.ecaActivity.timeSlot}`

      if (studentSlots[selection.studentId]?.[slotKey]) continue

      const maxCap = selection.ecaActivity.maxCapacity ?? DEFAULT_MAX_CAPACITY
      if (activityEnrollment[selection.ecaActivityId].length >= maxCap) {
        waitlistCounts[selection.ecaActivityId] = (waitlistCounts[selection.ecaActivityId] || 0) + 1
        continue
      }

      if (!studentSlots[selection.studentId]) {
        studentSlots[selection.studentId] = {}
      }
      studentSlots[selection.studentId][slotKey] = selection.ecaActivityId
      activityEnrollment[selection.ecaActivityId].push(selection.studentId)
    }
  }

  // Default selection mode from settings
  const defaultMode = settings?.selectionMode || 'FIRST_COME_FIRST_SERVED'

  // Build preview
  const preview: AllocationPreview = {
    activities: [],
    totalAllocations: 0,
    totalWaitlist: 0,
    activitiesToCancel: 0,
    selectionMode,
    defaultSelectionMode: defaultMode,
  }

  for (const activity of activities) {
    const allocations = activityEnrollment[activity.id].length
    const waitlist = waitlistCounts[activity.id] || 0
    const minCap = activity.minCapacity ?? DEFAULT_MIN_CAPACITY
    const belowMinimum = allocations < minCap

    preview.activities.push({
      activityId: activity.id,
      activityName: activity.name,
      allocations,
      waitlist,
      belowMinimum,
      willBeCancelled: belowMinimum,
      minCapacity: activity.minCapacity,
    })

    preview.totalAllocations += allocations
    preview.totalWaitlist += waitlist
    if (belowMinimum) preview.activitiesToCancel++
  }

  return preview
}

/**
 * Generate suggestions for improving allocation results
 */
function generateSuggestions(
  result: SmartAllocationResult,
  selections: SelectionWithDetails[],
  activities: ActivityWithDetails[],
  activityEnrollment: ActivityEnrollmentMap
): void {
  // Count selections per activity (demand)
  const selectionCounts = new Map<string, number>()
  for (const selection of selections) {
    const count = selectionCounts.get(selection.ecaActivityId) || 0
    selectionCounts.set(selection.ecaActivityId, count + 1)
  }

  for (const activity of activities) {
    if (activity.isCancelled) continue

    const enrollment = activityEnrollment[activity.id]?.length || 0
    const demand = selectionCounts.get(activity.id) || 0
    const maxCap = getEffectiveMaxCapacity(activity)
    const minCap = activity.minCapacity ?? DEFAULT_MIN_CAPACITY

    // Suggestion: Increase capacity for oversubscribed activities
    if (demand > maxCap && enrollment >= maxCap * 0.9) {
      const waitlistCount = demand - enrollment
      result.suggestions.push({
        type: 'INCREASE_CAPACITY',
        priority: waitlistCount > 10 ? 'HIGH' : waitlistCount > 5 ? 'MEDIUM' : 'LOW',
        title: `Increase capacity for ${activity.name}`,
        description: `${activity.name} has ${waitlistCount} students on the waitlist. Consider increasing capacity from ${maxCap} to ${Math.min(maxCap + waitlistCount, maxCap + 10)} to accommodate more students.`,
        activityId: activity.id,
        activityName: activity.name,
        currentValue: maxCap,
        suggestedValue: Math.min(maxCap + waitlistCount, maxCap + 10),
        affectedCount: waitlistCount,
      })
    }

    // Suggestion: Activity at risk - decrease minimum or find more students
    if (enrollment > 0 && enrollment < minCap) {
      const shortfall = minCap - enrollment
      result.suggestions.push({
        type: 'DECREASE_MINIMUM',
        priority: shortfall > 3 ? 'HIGH' : 'MEDIUM',
        title: `${activity.name} is below minimum capacity`,
        description: `${activity.name} has ${enrollment} students but needs ${minCap} minimum. Consider lowering the minimum to ${enrollment} or finding ${shortfall} more students to avoid cancellation.`,
        activityId: activity.id,
        activityName: activity.name,
        currentValue: minCap,
        suggestedValue: enrollment,
        affectedCount: shortfall,
      })
    }

    // Suggestion: High demand - consider adding another session
    if (demand > maxCap * 1.5) {
      result.suggestions.push({
        type: 'ADD_SESSION',
        priority: 'MEDIUM',
        title: `Consider adding another ${activity.name} session`,
        description: `${activity.name} has very high demand (${demand} selections for ${maxCap} spots). Consider adding another session on a different day.`,
        activityId: activity.id,
        activityName: activity.name,
        currentValue: demand,
        suggestedValue: maxCap,
        affectedCount: demand - maxCap,
      })
    }
  }

  // Suggestion: Manual placement needed for unallocated students
  if (result.unallocatedStudents.length > 0) {
    result.suggestions.push({
      type: 'MANUAL_PLACEMENT',
      priority: 'HIGH',
      title: `${result.unallocatedStudents.length} students need manual placement`,
      description: `${result.unallocatedStudents.length} student(s) could not be automatically placed in activities. Review the unallocated students list and manually assign them to appropriate activities.`,
      affectedCount: result.unallocatedStudents.length,
    })
  }

  // Sort suggestions by priority (HIGH first)
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  result.suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}

// Fisher-Yates shuffle for fairness
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export default {
  runAllocation,
  previewAllocation,
}
