import prisma from './prisma.js'

// First names for students
const FIRST_NAMES_BOYS = [
  'Mohammed', 'Ahmed', 'Omar', 'Ali', 'Hassan', 'Yusuf', 'Adam', 'Noah', 'Zaid', 'Ibrahim',
  'Khalid', 'Rashid', 'Saif', 'Hamza', 'Bilal', 'Tariq', 'Faisal', 'Amir', 'Sami', 'Kareem',
  'James', 'Oliver', 'Jack', 'Harry', 'George', 'Leo', 'Charlie', 'Freddie', 'Alfie', 'Oscar',
  'William', 'Henry', 'Thomas', 'Edward', 'Alexander', 'Sebastian', 'Max', 'Lucas', 'Ethan', 'Daniel'
]

const FIRST_NAMES_GIRLS = [
  'Fatima', 'Aisha', 'Maryam', 'Sara', 'Layla', 'Noor', 'Hana', 'Zara', 'Amina', 'Yasmin',
  'Salma', 'Leila', 'Rania', 'Dina', 'Lina', 'Maya', 'Jana', 'Rana', 'Nadia', 'Samira',
  'Olivia', 'Emily', 'Isla', 'Ava', 'Sophie', 'Mia', 'Grace', 'Lily', 'Ella', 'Chloe',
  'Charlotte', 'Amelia', 'Harper', 'Emma', 'Evelyn', 'Aria', 'Luna', 'Scarlett', 'Victoria', 'Madison'
]

// Last names (mix of Arabic and Western)
const LAST_NAMES = [
  'Al-Hassan', 'Al-Rashid', 'Al-Mahmoud', 'Al-Ahmed', 'Al-Sayed', 'Al-Farsi', 'Al-Qasim', 'Al-Nasser',
  'Khan', 'Malik', 'Shah', 'Mirza', 'Patel', 'Singh', 'Sharma', 'Gupta',
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson',
  'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson',
  'Garcia', 'Martinez', 'Robinson', 'Clark', 'Rodriguez', 'Lewis', 'Lee', 'Walker'
]

// Parent first names
const PARENT_FIRST_NAMES_MALE = [
  'Mohammed', 'Ahmed', 'Ali', 'Omar', 'Hassan', 'Khalid', 'Yusuf', 'Ibrahim',
  'John', 'David', 'Michael', 'Robert', 'James', 'William', 'Richard', 'Thomas'
]

const PARENT_FIRST_NAMES_FEMALE = [
  'Fatima', 'Aisha', 'Sara', 'Maryam', 'Noor', 'Hana', 'Layla', 'Yasmin',
  'Sarah', 'Emma', 'Jennifer', 'Lisa', 'Michelle', 'Elizabeth', 'Anna', 'Maria'
]

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateEmail(firstName: string, lastName: string, index: number): string {
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '')
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '')
  return `${cleanFirst}.${cleanLast}.${index}@testparent.wasil.app`
}

interface SeedOptions {
  studentsPerClass?: number
  includeEcaSelections?: boolean
}

interface SeedResult {
  studentsCreated: number
  parentsCreated: number
  linksCreated: number
  ecaSelectionsCreated: number
}

/**
 * Seed test students and parents for a school
 */
export async function seedTestData(schoolId: string, options: SeedOptions = {}): Promise<SeedResult> {
  const { studentsPerClass = 10, includeEcaSelections = false } = options

  const result: SeedResult = {
    studentsCreated: 0,
    parentsCreated: 0,
    linksCreated: 0,
    ecaSelectionsCreated: 0,
  }

  // Get all classes for this school
  const classes = await prisma.class.findMany({
    where: { schoolId },
    include: { yearGroup: true },
  })

  if (classes.length === 0) {
    throw new Error('No classes found. Please create classes first.')
  }

  let studentIndex = 0

  for (const classItem of classes) {
    for (let i = 0; i < studentsPerClass; i++) {
      studentIndex++

      // Randomly assign gender
      const isBoy = Math.random() > 0.5
      const firstName = randomElement(isBoy ? FIRST_NAMES_BOYS : FIRST_NAMES_GIRLS)
      const lastName = randomElement(LAST_NAMES)

      // Create student
      const student = await prisma.student.create({
        data: {
          firstName,
          lastName,
          externalId: `TEST-${studentIndex.toString().padStart(4, '0')}`,
          schoolId,
          classId: classItem.id,
        },
      })
      result.studentsCreated++

      // Create 1-2 parents for this student
      const numParents = Math.random() > 0.3 ? 2 : 1

      for (let p = 0; p < numParents; p++) {
        const parentFirstName = randomElement(
          p === 0 ? PARENT_FIRST_NAMES_FEMALE : PARENT_FIRST_NAMES_MALE
        )
        const parentEmail = generateEmail(parentFirstName, lastName, studentIndex * 10 + p)

        // Check if parent already exists (unlikely with unique emails)
        let parent = await prisma.user.findUnique({
          where: { email: parentEmail },
        })

        if (!parent) {
          parent = await prisma.user.create({
            data: {
              email: parentEmail,
              name: `${parentFirstName} ${lastName}`,
              role: 'PARENT',
              schoolId,
            },
          })
          result.parentsCreated++
        }

        // Create parent-student link
        await prisma.parentStudentLink.create({
          data: {
            userId: parent.id,
            studentId: student.id,
          },
        })
        result.linksCreated++
      }
    }
  }

  // Optionally seed ECA selections
  if (includeEcaSelections) {
    const ecaSelectionsCount = await seedEcaSelections(schoolId)
    result.ecaSelectionsCreated = ecaSelectionsCount
  }

  return result
}

/**
 * Seed ECA selections for testing allocation
 */
async function seedEcaSelections(schoolId: string): Promise<number> {
  // Find active registration term
  const term = await prisma.ecaTerm.findFirst({
    where: {
      schoolId,
      status: { in: ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'] },
    },
    include: {
      activities: {
        where: { isActive: true, isCancelled: false },
      },
    },
  })

  if (!term || term.activities.length === 0) {
    return 0
  }

  // Get all students with their parents
  const studentLinks = await prisma.parentStudentLink.findMany({
    where: {
      student: { schoolId },
    },
    include: {
      student: {
        include: { class: { include: { yearGroup: true } } },
      },
    },
  })

  // Group by student (take first parent for each)
  const studentParentMap = new Map<string, { studentId: string; parentId: string; yearGroupId: string | null }>()
  for (const link of studentLinks) {
    if (!studentParentMap.has(link.studentId)) {
      studentParentMap.set(link.studentId, {
        studentId: link.studentId,
        parentId: link.userId,
        yearGroupId: link.student.class.yearGroupId,
      })
    }
  }

  let selectionsCreated = 0

  // For each student, create some random selections
  for (const [studentId, info] of studentParentMap) {
    // Filter eligible activities for this student
    const eligibleActivities = term.activities.filter(activity => {
      const eligibleYearGroupIds = activity.eligibleYearGroupIds as string[]
      if (eligibleYearGroupIds.length === 0) return true
      if (!info.yearGroupId) return false
      return eligibleYearGroupIds.includes(info.yearGroupId)
    })

    if (eligibleActivities.length === 0) continue

    // Group activities by day/slot
    const activitiesBySlot = new Map<string, typeof eligibleActivities>()
    for (const activity of eligibleActivities) {
      const key = `${activity.dayOfWeek}-${activity.timeSlot}`
      if (!activitiesBySlot.has(key)) {
        activitiesBySlot.set(key, [])
      }
      activitiesBySlot.get(key)!.push(activity)
    }

    // For each slot, maybe create some selections (70% chance)
    for (const [, slotActivities] of activitiesBySlot) {
      if (Math.random() > 0.7) continue // 30% skip this slot

      // Shuffle and pick 1-3 choices
      const shuffled = [...slotActivities].sort(() => Math.random() - 0.5)
      const numChoices = Math.min(shuffled.length, Math.floor(Math.random() * 3) + 1)

      for (let rank = 1; rank <= numChoices; rank++) {
        const activity = shuffled[rank - 1]

        try {
          await prisma.ecaSelection.create({
            data: {
              ecaTermId: term.id,
              studentId,
              parentUserId: info.parentId,
              ecaActivityId: activity.id,
              rank,
              isPriority: rank === 1 && Math.random() > 0.7, // 30% chance of priority
            },
          })
          selectionsCreated++
        } catch {
          // Ignore duplicate selections
        }
      }
    }
  }

  return selectionsCreated
}

/**
 * Clear all test data (students with TEST- external IDs and their parents)
 */
export async function clearTestData(schoolId: string): Promise<{ studentsDeleted: number; parentsDeleted: number }> {
  // Find all test students
  const testStudents = await prisma.student.findMany({
    where: {
      schoolId,
      externalId: { startsWith: 'TEST-' },
    },
    include: {
      parentLinks: true,
    },
  })

  // Collect parent IDs to check for deletion
  const parentIds = new Set<string>()
  for (const student of testStudents) {
    for (const link of student.parentLinks) {
      parentIds.add(link.userId)
    }
  }

  // Delete students (cascades to parent links, ECA selections, etc.)
  const deleteResult = await prisma.student.deleteMany({
    where: {
      schoolId,
      externalId: { startsWith: 'TEST-' },
    },
  })

  // Delete parents who have no more student links and have test email
  let parentsDeleted = 0
  for (const parentId of parentIds) {
    const remainingLinks = await prisma.parentStudentLink.count({
      where: { userId: parentId },
    })

    if (remainingLinks === 0) {
      // Check if it's a test parent (by email pattern)
      const parent = await prisma.user.findUnique({
        where: { id: parentId },
      })

      if (parent?.email.endsWith('@testparent.wasil.app')) {
        await prisma.user.delete({
          where: { id: parentId },
        })
        parentsDeleted++
      }
    }
  }

  return {
    studentsDeleted: deleteResult.count,
    parentsDeleted,
  }
}

/**
 * Get count of test data
 */
export async function getTestDataStats(schoolId: string): Promise<{
  testStudents: number
  testParents: number
  totalStudents: number
  totalParents: number
}> {
  const [testStudents, testParents, totalStudents, totalParents] = await Promise.all([
    prisma.student.count({
      where: { schoolId, externalId: { startsWith: 'TEST-' } },
    }),
    prisma.user.count({
      where: { schoolId, role: 'PARENT', email: { endsWith: '@testparent.wasil.app' } },
    }),
    prisma.student.count({
      where: { schoolId },
    }),
    prisma.user.count({
      where: { schoolId, role: 'PARENT' },
    }),
  ])

  return { testStudents, testParents, totalStudents, totalParents }
}

export default {
  seedTestData,
  clearTestData,
  getTestDataStats,
}
