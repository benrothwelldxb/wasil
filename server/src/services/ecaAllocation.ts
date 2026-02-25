import prisma from './prisma.js'
import type { EcaAllocationType, EcaAllocationStatus, EcaSelectionMode } from '@prisma/client'

interface AllocationResult {
  success: boolean
  allocations: number
  waitlisted: number
  cancelledActivities: number
  errors: string[]
}

interface AllocationPreview {
  activities: Array<{
    activityId: string
    activityName: string
    allocations: number
    waitlist: number
    belowMinimum: boolean
    willBeCancelled: boolean
  }>
  totalAllocations: number
  totalWaitlist: number
  activitiesToCancel: number
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
  }
  ecaActivity: {
    id: string
    name: string
    dayOfWeek: number
    timeSlot: 'BEFORE_SCHOOL' | 'AFTER_SCHOOL'
    maxCapacity: number | null
    minCapacity: number | null
    activityType: 'OPEN' | 'INVITE_ONLY' | 'COMPULSORY' | 'TRYOUT'
  }
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

/**
 * Run the ECA allocation algorithm for a term
 */
export async function runAllocation(ecaTermId: string, schoolId: string): Promise<AllocationResult> {
  const result: AllocationResult = {
    success: false,
    allocations: 0,
    waitlisted: 0,
    cancelledActivities: 0,
    errors: [],
  }

  try {
    // Get ECA settings for the school
    const settings = await prisma.ecaSettings.findUnique({
      where: { schoolId },
    })

    const selectionMode: EcaSelectionMode = settings?.selectionMode || 'FIRST_COME_FIRST_SERVED'

    // Get all activities for this term
    const activities = await prisma.ecaActivity.findMany({
      where: {
        ecaTermId,
        isActive: true,
        isCancelled: false,
      },
    })

    // Get all selections for this term
    const selections = await prisma.ecaSelection.findMany({
      where: { ecaTermId },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, classId: true },
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
      activityEnrollment[allocation.ecaActivityId].push(allocation.studentId)
    }

    // Clear previous allocation results (but keep COMPULSORY and INVITED)
    await prisma.ecaAllocation.deleteMany({
      where: {
        ecaTermId,
        allocationType: { in: ['FIRST_COME', 'SMART_PRIORITY', 'SMART_RANKED', 'SMART_REALLOCATION'] },
      },
    })

    // Clear previous waitlist
    await prisma.ecaWaitlist.deleteMany({
      where: { ecaTermId },
    })

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
      await runSmartAllocation(
        ecaTermId,
        selections,
        activities,
        studentSlots,
        activityEnrollment,
        result
      )
    }

    // Check minimum capacity and cancel under-enrolled activities
    for (const activity of activities) {
      if (activity.minCapacity && activityEnrollment[activity.id].length < activity.minCapacity) {
        // Cancel the activity
        await prisma.ecaActivity.update({
          where: { id: activity.id },
          data: {
            isCancelled: true,
            cancelReason: `Minimum capacity of ${activity.minCapacity} not met`,
          },
        })

        // Remove allocations for this activity
        await prisma.ecaAllocation.deleteMany({
          where: { ecaActivityId: activity.id },
        })

        // Try to reallocate affected students to their backup choices
        const affectedStudentIds = activityEnrollment[activity.id]
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
      }
    }

    // Update term status
    await prisma.ecaTerm.update({
      where: { id: ecaTermId },
      data: { allocationRun: true },
    })

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
  activities: any[],
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  result: AllocationResult
): Promise<void> {
  // Process selections in order of submission time
  for (const selection of selections) {
    const activity = selection.ecaActivity
    const slotKey = `${activity.dayOfWeek}-${activity.timeSlot}`

    // Skip if student already has an activity in this slot
    if (studentSlots[selection.studentId]?.[slotKey]) {
      continue
    }

    // Check capacity
    const currentEnrollment = activityEnrollment[activity.id]?.length || 0
    if (activity.maxCapacity && currentEnrollment >= activity.maxCapacity) {
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
      studentSlots,
      activityEnrollment,
      slotKey,
      result
    )
  }
}

/**
 * Smart Allocation with priority pass and ranked choices
 */
async function runSmartAllocation(
  ecaTermId: string,
  selections: SelectionWithDetails[],
  activities: any[],
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  result: AllocationResult
): Promise<void> {
  // Separate priority and regular selections
  const prioritySelections = selections.filter(s => s.isPriority)
  const regularSelections = selections.filter(s => !s.isPriority)

  // Pass 1: Process priority selections (in submission order)
  for (const selection of prioritySelections) {
    const activity = selection.ecaActivity
    const slotKey = `${activity.dayOfWeek}-${activity.timeSlot}`

    if (studentSlots[selection.studentId]?.[slotKey]) continue

    const currentEnrollment = activityEnrollment[activity.id]?.length || 0
    if (activity.maxCapacity && currentEnrollment >= activity.maxCapacity) {
      await addToWaitlist(ecaTermId, selection.studentId, activity.id, result)
      continue
    }

    await createAllocation(
      ecaTermId,
      selection.studentId,
      activity.id,
      'SMART_PRIORITY',
      1,
      studentSlots,
      activityEnrollment,
      slotKey,
      result
    )
  }

  // Group regular selections by rank
  const rank1 = regularSelections.filter(s => s.rank === 1)
  const rank2 = regularSelections.filter(s => s.rank === 2)
  const rank3 = regularSelections.filter(s => s.rank === 3)

  // Pass 2: Process rank 1 choices (randomized for fairness)
  const shuffledRank1 = shuffleArray([...rank1])
  for (const selection of shuffledRank1) {
    await processRankedSelection(selection, 2, studentSlots, activityEnrollment, ecaTermId, result)
  }

  // Pass 3: Process rank 2 choices
  const shuffledRank2 = shuffleArray([...rank2])
  for (const selection of shuffledRank2) {
    await processRankedSelection(selection, 3, studentSlots, activityEnrollment, ecaTermId, result)
  }

  // Pass 4: Process rank 3 choices
  const shuffledRank3 = shuffleArray([...rank3])
  for (const selection of shuffledRank3) {
    await processRankedSelection(selection, 4, studentSlots, activityEnrollment, ecaTermId, result)
  }
}

async function processRankedSelection(
  selection: SelectionWithDetails,
  round: number,
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  ecaTermId: string,
  result: AllocationResult
): Promise<void> {
  const activity = selection.ecaActivity
  const slotKey = `${activity.dayOfWeek}-${activity.timeSlot}`

  // Skip if student already has an activity in this slot
  if (studentSlots[selection.studentId]?.[slotKey]) return

  const currentEnrollment = activityEnrollment[activity.id]?.length || 0
  if (activity.maxCapacity && currentEnrollment >= activity.maxCapacity) {
    // Only waitlist on first choice pass
    if (selection.rank === 1) {
      await addToWaitlist(ecaTermId, selection.studentId, activity.id, result)
    }
    return
  }

  await createAllocation(
    ecaTermId,
    selection.studentId,
    activity.id,
    'SMART_RANKED',
    round,
    studentSlots,
    activityEnrollment,
    slotKey,
    result
  )
}

/**
 * Reallocate students from cancelled activities to their backup choices
 */
async function reallocateStudents(
  ecaTermId: string,
  studentIds: string[],
  cancelledActivityId: string,
  selections: SelectionWithDetails[],
  activities: any[],
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  result: AllocationResult
): Promise<void> {
  for (const studentId of studentIds) {
    // Find student's other selections for the same day/slot
    const studentSelections = selections
      .filter(s => s.studentId === studentId && s.ecaActivityId !== cancelledActivityId)
      .sort((a, b) => a.rank - b.rank)

    for (const selection of studentSelections) {
      const activity = selection.ecaActivity
      const slotKey = `${activity.dayOfWeek}-${activity.timeSlot}`

      // Check if this is for the same slot as cancelled activity
      const cancelledActivity = activities.find(a => a.id === cancelledActivityId)
      if (!cancelledActivity) continue

      const cancelledSlotKey = `${cancelledActivity.dayOfWeek}-${cancelledActivity.timeSlot}`
      if (slotKey !== cancelledSlotKey) continue

      // Check capacity
      const currentEnrollment = activityEnrollment[activity.id]?.length || 0
      if (activity.maxCapacity && currentEnrollment >= activity.maxCapacity) {
        continue
      }

      // Reallocate
      await createAllocation(
        ecaTermId,
        studentId,
        activity.id,
        'SMART_REALLOCATION',
        null,
        studentSlots,
        activityEnrollment,
        slotKey,
        result
      )
      break
    }
  }
}

async function createAllocation(
  ecaTermId: string,
  studentId: string,
  activityId: string,
  allocationType: EcaAllocationType,
  round: number | null,
  studentSlots: StudentSlotMap,
  activityEnrollment: ActivityEnrollmentMap,
  slotKey: string,
  result: AllocationResult
): Promise<void> {
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
  activityEnrollment[activityId].push(studentId)

  result.allocations++
}

async function addToWaitlist(
  ecaTermId: string,
  studentId: string,
  activityId: string,
  result: AllocationResult
): Promise<void> {
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
}

/**
 * Preview allocation results without committing
 */
export async function previewAllocation(ecaTermId: string, schoolId: string): Promise<AllocationPreview> {
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

  // Simple simulation based on mode
  const selectionMode = settings?.selectionMode || 'FIRST_COME_FIRST_SERVED'

  if (selectionMode === 'FIRST_COME_FIRST_SERVED') {
    for (const selection of selections) {
      const slotKey = `${selection.ecaActivity.dayOfWeek}-${selection.ecaActivity.timeSlot}`

      if (studentSlots[selection.studentId]?.[slotKey]) continue

      const maxCap = selection.ecaActivity.maxCapacity
      if (maxCap && activityEnrollment[selection.ecaActivityId].length >= maxCap) {
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

      const maxCap = selection.ecaActivity.maxCapacity
      if (maxCap && activityEnrollment[selection.ecaActivityId].length >= maxCap) {
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

  // Build preview
  const preview: AllocationPreview = {
    activities: [],
    totalAllocations: 0,
    totalWaitlist: 0,
    activitiesToCancel: 0,
  }

  for (const activity of activities) {
    const allocations = activityEnrollment[activity.id].length
    const waitlist = waitlistCounts[activity.id] || 0
    const belowMinimum = activity.minCapacity ? allocations < activity.minCapacity : false

    preview.activities.push({
      activityId: activity.id,
      activityName: activity.name,
      allocations,
      waitlist,
      belowMinimum,
      willBeCancelled: belowMinimum,
    })

    preview.totalAllocations += allocations
    preview.totalWaitlist += waitlist
    if (belowMinimum) preview.activitiesToCancel++
  }

  return preview
}

// Fisher-Yates shuffle for fairness
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

export default {
  runAllocation,
  previewAllocation,
}
