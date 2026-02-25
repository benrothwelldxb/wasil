import prisma from './prisma.js'

// ECA Activity templates by category
const ECA_ACTIVITIES = {
  sports: [
    { name: 'Football Club', description: 'Learn football skills and play matches' },
    { name: 'Basketball', description: 'Basketball training and games' },
    { name: 'Swimming', description: 'Swimming lessons and practice' },
    { name: 'Tennis', description: 'Tennis coaching for all levels' },
    { name: 'Gymnastics', description: 'Gymnastics and tumbling' },
    { name: 'Cricket', description: 'Cricket skills and matches' },
    { name: 'Athletics', description: 'Track and field activities' },
    { name: 'Volleyball', description: 'Volleyball training' },
    { name: 'Badminton', description: 'Badminton for beginners and advanced' },
    { name: 'Table Tennis', description: 'Table tennis club' },
  ],
  arts: [
    { name: 'Art Club', description: 'Painting, drawing and crafts' },
    { name: 'Drama', description: 'Acting and theatre skills' },
    { name: 'Choir', description: 'Singing and vocal training' },
    { name: 'Orchestra', description: 'Instrumental ensemble' },
    { name: 'Dance', description: 'Various dance styles' },
    { name: 'Photography', description: 'Digital photography skills' },
    { name: 'Film Making', description: 'Create short films' },
    { name: 'Creative Writing', description: 'Stories, poems and more' },
  ],
  academic: [
    { name: 'Chess Club', description: 'Learn chess strategies' },
    { name: 'Debate Club', description: 'Public speaking and debate' },
    { name: 'Science Club', description: 'Experiments and discoveries' },
    { name: 'Coding Club', description: 'Learn programming' },
    { name: 'Robotics', description: 'Build and program robots' },
    { name: 'Math Olympiad', description: 'Advanced math challenges' },
    { name: 'Book Club', description: 'Reading and discussions' },
    { name: 'Model UN', description: 'Model United Nations' },
  ],
  languages: [
    { name: 'Arabic Club', description: 'Arabic language and culture' },
    { name: 'French Club', description: 'French language practice' },
    { name: 'Spanish Club', description: 'Spanish language practice' },
    { name: 'Mandarin Club', description: 'Mandarin Chinese basics' },
  ],
  other: [
    { name: 'Cooking Club', description: 'Learn to cook various dishes' },
    { name: 'Gardening', description: 'Plant and grow vegetables' },
    { name: 'Eco Warriors', description: 'Environmental projects' },
    { name: 'Board Games', description: 'Strategy and fun games' },
    { name: 'Minecraft Club', description: 'Creative building in Minecraft' },
    { name: 'Yoga & Mindfulness', description: 'Relaxation and wellness' },
  ],
}

// Locations for activities
const LOCATIONS = [
  'Sports Hall', 'Gymnasium', 'Swimming Pool', 'Tennis Courts', 'Football Field',
  'Art Room', 'Music Room', 'Drama Studio', 'Library', 'Science Lab',
  'Computer Lab', 'Classroom 1A', 'Classroom 2B', 'Multi-Purpose Room', 'Outdoor Area'
]

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
  includeEcaActivities?: boolean
  includeEcaSelections?: boolean
}

interface SeedResult {
  studentsCreated: number
  parentsCreated: number
  linksCreated: number
  ecaActivitiesCreated: number
  ecaSelectionsCreated: number
}

/**
 * Seed test students and parents for a school
 */
export async function seedTestData(schoolId: string, options: SeedOptions = {}): Promise<SeedResult> {
  const { studentsPerClass = 10, includeEcaActivities = false, includeEcaSelections = false } = options

  const result: SeedResult = {
    studentsCreated: 0,
    parentsCreated: 0,
    linksCreated: 0,
    ecaActivitiesCreated: 0,
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

  // Optionally seed ECA activities
  if (includeEcaActivities) {
    const ecaActivitiesCount = await seedEcaActivities(schoolId)
    result.ecaActivitiesCreated = ecaActivitiesCount
  }

  // Optionally seed ECA selections
  if (includeEcaSelections) {
    const ecaSelectionsCount = await seedEcaSelections(schoolId)
    result.ecaSelectionsCreated = ecaSelectionsCount
  }

  return result
}

/**
 * Seed ECA activities for a term
 */
async function seedEcaActivities(schoolId: string): Promise<number> {
  // Find a term that's in draft or registration phase
  let term = await prisma.ecaTerm.findFirst({
    where: {
      schoolId,
      status: { in: ['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED'] },
    },
  })

  // If no term exists, create one
  if (!term) {
    const now = new Date()
    const registrationOpens = new Date(now)
    registrationOpens.setDate(now.getDate() - 7) // Opened a week ago
    const registrationCloses = new Date(now)
    registrationCloses.setDate(now.getDate() + 14) // Closes in 2 weeks
    const termStart = new Date(registrationCloses)
    termStart.setDate(termStart.getDate() + 7) // Starts 1 week after registration closes
    const termEnd = new Date(termStart)
    termEnd.setMonth(termEnd.getMonth() + 3) // 3 months term

    term = await prisma.ecaTerm.create({
      data: {
        schoolId,
        name: 'Test Term 1',
        termNumber: 1,
        academicYear: '2025/26',
        startDate: termStart,
        endDate: termEnd,
        registrationOpens,
        registrationCloses,
        defaultBeforeSchoolStart: '07:30',
        defaultBeforeSchoolEnd: '08:15',
        defaultAfterSchoolStart: '15:30',
        defaultAfterSchoolEnd: '16:30',
        status: 'REGISTRATION_OPEN',
      },
    })
  }

  // Get all year groups for eligibility
  const yearGroups = await prisma.yearGroup.findMany({
    where: { schoolId },
    orderBy: { order: 'asc' },
  })

  // Flatten all activities
  const allActivities = [
    ...ECA_ACTIVITIES.sports,
    ...ECA_ACTIVITIES.arts,
    ...ECA_ACTIVITIES.academic,
    ...ECA_ACTIVITIES.languages,
    ...ECA_ACTIVITIES.other,
  ]

  // Shuffle activities
  const shuffled = [...allActivities].sort(() => Math.random() - 0.5)

  let activitiesCreated = 0
  const daysOfWeek = [0, 1, 2, 3, 4] // Sunday to Thursday (typical school week in Middle East)
  const timeSlots: Array<'BEFORE_SCHOOL' | 'AFTER_SCHOOL'> = ['BEFORE_SCHOOL', 'AFTER_SCHOOL']

  // Create 2-4 activities per day per slot
  let activityIndex = 0
  for (const dayOfWeek of daysOfWeek) {
    for (const timeSlot of timeSlots) {
      const activitiesPerSlot = Math.floor(Math.random() * 3) + 2 // 2-4 activities

      for (let i = 0; i < activitiesPerSlot && activityIndex < shuffled.length; i++) {
        const activity = shuffled[activityIndex]
        activityIndex++

        // Determine eligibility - some activities are for all, some for specific year groups
        let eligibleYearGroupIds: string[] = []
        const eligibilityType = Math.random()
        if (eligibilityType < 0.4) {
          // 40% - All year groups
          eligibleYearGroupIds = []
        } else if (eligibilityType < 0.7) {
          // 30% - Lower years (first half of year groups)
          const halfPoint = Math.ceil(yearGroups.length / 2)
          eligibleYearGroupIds = yearGroups.slice(0, halfPoint).map(yg => yg.id)
        } else {
          // 30% - Upper years (second half of year groups)
          const halfPoint = Math.floor(yearGroups.length / 2)
          eligibleYearGroupIds = yearGroups.slice(halfPoint).map(yg => yg.id)
        }

        // Random capacity
        const minCapacity = Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 5 : null // 30% have min capacity
        const maxCapacity = Math.floor(Math.random() * 15) + 10 // 10-25 max

        try {
          await prisma.ecaActivity.create({
            data: {
              ecaTermId: term.id,
              schoolId,
              name: activity.name,
              description: activity.description,
              dayOfWeek,
              timeSlot,
              location: randomElement(LOCATIONS),
              activityType: 'OPEN',
              eligibleYearGroupIds,
              eligibleGender: 'MIXED',
              minCapacity,
              maxCapacity,
              isActive: true,
            },
          })
          activitiesCreated++
        } catch {
          // Ignore duplicates
        }
      }
    }
  }

  return activitiesCreated
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
