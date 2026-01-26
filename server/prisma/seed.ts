import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clean up existing data (in correct order for foreign key constraints)
  console.log('Cleaning up existing data...')
  await prisma.schoolFile.deleteMany({})
  await prisma.fileFolder.deleteMany({})
  await prisma.policy.deleteMany({})
  await prisma.pulseResponse.deleteMany({})
  await prisma.pulseSurvey.deleteMany({})
  await prisma.knowledgeArticle.deleteMany({})
  await prisma.knowledgeCategory.deleteMany({})
  await prisma.weeklyMessageHeart.deleteMany({})
  await prisma.weeklyMessage.deleteMany({})
  await prisma.scheduleItem.deleteMany({})
  await prisma.termDate.deleteMany({})
  await prisma.eventRsvp.deleteMany({})
  await prisma.event.deleteMany({})
  await prisma.surveyResponse.deleteMany({})
  await prisma.survey.deleteMany({})
  await prisma.messageAcknowledgment.deleteMany({})
  await prisma.message.deleteMany({})
  console.log('Cleanup complete')

  // Create School
  const school = await prisma.school.upsert({
    where: { id: 'vhps-school-1' },
    update: { academicYear: '2025/26' },
    create: {
      id: 'vhps-school-1',
      name: 'Victory Heights Primary School',
      shortName: 'VHPS',
      city: 'City of Arabia',
      academicYear: '2025/26',
      brandColor: '#7f0029',
      accentColor: '#D4AF37',
      tagline: 'Stay Connected',
      logoUrl: '/school-logo.png',
      logoIconUrl: '/logo.png',
    },
  })
  console.log('Created school:', school.name)

  // Create Classes
  const classData = [
    { name: 'FS1 Blue', colorBg: 'bg-blue-500', colorText: 'text-white' },
    { name: 'Y2 Red', colorBg: 'bg-red-500', colorText: 'text-white' },
    { name: 'Y4 Green', colorBg: 'bg-green-500', colorText: 'text-white' },
  ]

  const classes: Record<string, { id: string }> = {}
  for (const cls of classData) {
    const created = await prisma.class.upsert({
      where: { schoolId_name: { schoolId: school.id, name: cls.name } },
      update: {},
      create: {
        name: cls.name,
        colorBg: cls.colorBg,
        colorText: cls.colorText,
        schoolId: school.id,
      },
    })
    classes[cls.name] = created
    console.log('Created class:', cls.name)
  }

  // Create Admin User
  const admin = await prisma.user.upsert({
    where: { email: 'admin@vhps.ae' },
    update: {},
    create: {
      email: 'admin@vhps.ae',
      name: 'Principal Johnson',
      role: 'ADMIN',
      schoolId: school.id,
    },
  })
  console.log('Created admin:', admin.email)

  // Create Parent User
  const parent = await prisma.user.upsert({
    where: { email: 'sarah@example.com' },
    update: {},
    create: {
      email: 'sarah@example.com',
      name: 'Sarah Williams',
      role: 'PARENT',
      schoolId: school.id,
    },
  })
  console.log('Created parent:', parent.email)

  // Create Super Admin User
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@wasil.app' },
    update: {},
    create: {
      email: 'superadmin@wasil.app',
      name: 'Wasil Super Admin',
      role: 'SUPER_ADMIN',
      schoolId: school.id,
    },
  })
  console.log('Created super admin:', superAdmin.email)

  // Create Children for Parent
  await prisma.child.deleteMany({ where: { parentId: parent.id } })
  await prisma.child.createMany({
    data: [
      { name: 'Emma', parentId: parent.id, classId: classes['FS1 Blue'].id },
      { name: 'Oliver', parentId: parent.id, classId: classes['Y2 Red'].id },
    ],
  })
  console.log('Created children for parent')

  // Create Messages
  const now = new Date()
  const messages = [
    {
      title: 'School Closure - Water Main Repair',
      content: 'IMPORTANT: School will be closed tomorrow (Wednesday) due to emergency water main repairs. Online learning resources will be available via the student portal. We apologise for any inconvenience.',
      targetClass: 'Whole School',
      senderId: admin.id,
      senderName: admin.name,
      isUrgent: true,
      isPinned: true,
    },
    {
      title: 'Welcome Back to Term 2!',
      content: 'We hope all families had a wonderful break. Term 2 begins Monday, January 13th.',
      targetClass: 'Whole School',
      senderId: admin.id,
      senderName: admin.name,
      actionType: 'consent',
      actionLabel: 'Medical Form Required',
      actionDueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      isPinned: true,
    },
    {
      title: 'Swimming Lessons Start Next Week',
      content: 'Swimming lessons begin Tuesday. Please send swimwear, towel, and goggles.',
      targetClass: 'Y2 Red',
      classId: classes['Y2 Red'].id,
      senderId: admin.id,
      senderName: 'Ms. Thompson',
      actionType: 'payment',
      actionLabel: 'Payment Due',
      actionDueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      actionAmount: 'AED 150',
    },
    {
      title: 'Show and Tell - Favorite Book',
      content: 'This Friday is Show and Tell! Please help your child bring their favorite book.',
      targetClass: 'FS1 Blue',
      classId: classes['FS1 Blue'].id,
      senderId: admin.id,
      senderName: 'Miss Carter',
    },
    {
      title: 'Parent Coffee Morning - Friday 9am',
      content: 'Join us this Friday at 9am in the school hall for our monthly parent coffee morning.',
      targetClass: 'Whole School',
      senderId: admin.id,
      senderName: admin.name,
      actionType: 'rsvp',
      actionLabel: 'RSVP Required',
      actionDueDate: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
    },
  ]

  for (const msg of messages) {
    await prisma.message.create({
      data: {
        ...msg,
        schoolId: school.id,
      },
    })
  }
  console.log('Created messages')

  // Create Surveys
  const surveys = [
    {
      question: 'How satisfied are you with the school communication so far this term?',
      options: ['Very Satisfied', 'Satisfied', 'Neutral', 'Dissatisfied'],
      targetClass: 'Whole School',
    },
    {
      question: 'Is the swimming lesson timing convenient for your family?',
      options: ['Yes, perfect', 'Yes, manageable', 'No, too early', 'No, too late'],
      targetClass: 'Y2 Red',
      classId: classes['Y2 Red'].id,
    },
  ]

  for (const survey of surveys) {
    await prisma.survey.create({
      data: {
        ...survey,
        schoolId: school.id,
      },
    })
  }
  console.log('Created surveys')

  // Create Events
  const events = [
    {
      title: 'Parent-Teacher Conferences',
      description: 'Individual meetings to discuss progress.',
      date: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      time: '15:00 - 19:00',
      location: 'Main Hall',
      targetClass: 'Whole School',
      requiresRsvp: true,
    },
    {
      title: 'Y2 Swimming Gala',
      description: 'Annual swimming competition.',
      date: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
      time: '10:00 - 12:00',
      location: 'Community Pool',
      targetClass: 'Y2 Red',
      classId: classes['Y2 Red'].id,
      requiresRsvp: true,
    },
  ]

  for (const event of events) {
    await prisma.event.create({
      data: {
        ...event,
        schoolId: school.id,
      },
    })
  }
  console.log('Created events')

  // Create Term Dates
  const termDates = [
    // Term 1
    { term: 1, termName: 'Term 1', label: 'Induction Day', sublabel: 'Families in school, scheduled appointments', date: new Date('2025-08-22'), type: 'induction', color: 'purple' },
    { term: 1, termName: 'Term 1', label: 'Term 1 starts', date: new Date('2025-08-25'), type: 'term-start', color: 'burgundy' },
    { term: 1, termName: 'Term 1', label: 'Half term', date: new Date('2025-10-13'), endDate: new Date('2025-10-17'), type: 'half-term', color: 'blue' },
    { term: 1, termName: 'Term 1', label: 'UAE National Day', sublabel: 'Public Holiday', date: new Date('2025-12-02'), type: 'public-holiday', color: 'green' },
    { term: 1, termName: 'Term 1', label: 'End of Term 1', date: new Date('2025-12-05'), type: 'term-end', color: 'burgundy' },
    // Term 2
    { term: 2, termName: 'Term 2', label: 'Term 2 starts', date: new Date('2026-01-05'), type: 'term-start', color: 'burgundy' },
    { term: 2, termName: 'Term 2', label: 'Half term', date: new Date('2026-02-09'), endDate: new Date('2026-02-13'), type: 'half-term', color: 'blue' },
    { term: 2, termName: 'Term 2', label: 'End of Term 2', date: new Date('2026-03-13'), type: 'term-end', color: 'burgundy' },
    // Term 3
    { term: 3, termName: 'Term 3', label: 'Term 3 starts', date: new Date('2026-03-30'), type: 'term-start', color: 'burgundy' },
    { term: 3, termName: 'Term 3', label: 'Half term', date: new Date('2026-05-04'), endDate: new Date('2026-05-08'), type: 'half-term', color: 'blue' },
    { term: 3, termName: 'Term 3', label: 'Eid Al Adha', sublabel: 'Public Holiday', date: new Date('2026-06-07'), endDate: new Date('2026-06-10'), type: 'public-holiday', color: 'green' },
    { term: 3, termName: 'Term 3', label: 'End of Term 3', date: new Date('2026-07-03'), type: 'term-end', color: 'burgundy' },
  ]

  for (const td of termDates) {
    await prisma.termDate.create({
      data: {
        ...td,
        schoolId: school.id,
      },
    })
  }
  console.log('Created term dates')

  // Create Schedule Items
  // Using today's date and dayOfWeek for realistic demo data
  const today = new Date()
  const todayDayOfWeek = today.getDay()

  const scheduleItems = [
    // FS1 Blue - PE on Wednesdays, Library on Thursdays
    { targetClass: 'FS1 Blue', classId: classes['FS1 Blue'].id, isRecurring: true, dayOfWeek: 3, type: 'pe', label: 'PE Day', description: 'Please wear PE kit', icon: '🏃' },
    { targetClass: 'FS1 Blue', classId: classes['FS1 Blue'].id, isRecurring: true, dayOfWeek: 4, type: 'library', label: 'Library Day', description: 'Return any borrowed books', icon: '📚' },
    // Y2 Red - Swimming on Tuesdays, Music on Thursdays
    { targetClass: 'Y2 Red', classId: classes['Y2 Red'].id, isRecurring: true, dayOfWeek: 2, type: 'swimming', label: 'Swimming Lesson', description: 'Remember swimwear, towel & goggles', icon: '🏊' },
    { targetClass: 'Y2 Red', classId: classes['Y2 Red'].id, isRecurring: true, dayOfWeek: 4, type: 'music', label: 'Music Lesson', description: 'Recorders needed today', icon: '🎵' },
    // Y4 Green - PE on Thursdays
    { targetClass: 'Y4 Green', classId: classes['Y4 Green'].id, isRecurring: true, dayOfWeek: 4, type: 'pe', label: 'PE Day', description: 'Please wear PE kit', icon: '🏃' },
    // One-off whole school event for today
    { targetClass: 'Whole School', isRecurring: false, date: today, type: 'early-finish', label: 'Early Finish', description: 'School ends at 1:00pm for staff training', icon: '🕐' },
  ]

  for (const item of scheduleItems) {
    await prisma.scheduleItem.create({
      data: {
        ...item,
        schoolId: school.id,
        active: true,
      },
    })
  }
  console.log('Created schedule items')

  // Create Weekly Messages (current + past weeks)
  const thisWeekStart = new Date()
  thisWeekStart.setDate(now.getDate() - now.getDay() + 1)

  const weeklyMessages = [
    {
      title: "Principal's Weekly Update",
      content: `Hello VHPS Families!

What an amazing week we've had! Our Year 2 swimmers are doing brilliantly - I popped down to watch them yesterday and the progress is incredible. So proud of every single one of them!

This Friday we're celebrating our maths superstars in assembly - it's always one of my favourite moments seeing the children's faces light up when they're recognized.

Quick reminder: Coffee morning this Friday at 9am in the hall. Come grab a cuppa and say hi!

Have a wonderful rest of the week!

Ben
Principal`,
      weekOf: thisWeekStart,
      isCurrent: true,
    },
    {
      title: "Principal's Weekly Update",
      content: `Dear VHPS Community,

Welcome back! I hope everyone had a restful winter break. It's wonderful to see all the smiling faces back in school.

This term we have lots of exciting activities planned, including our annual Book Week in February and the Year 4 residential trip in March.

Please remember to check your child's reading bag daily - our home reading programme is off to a flying start!

Looking forward to a fantastic term ahead.

Warm regards,
Ben
Principal`,
      weekOf: new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000),
      isCurrent: false,
    },
    {
      title: "Principal's Weekly Update",
      content: `Hello VHPS Families!

As we close out 2025, I wanted to take a moment to thank each and every one of you for your support this year. Our school community continues to grow stronger.

The Winter Concert was absolutely magical - a huge thank you to Ms. Davies and all our talented performers!

Wishing everyone a peaceful and joyful holiday season. See you in January!

Best wishes,
Ben
Principal`,
      weekOf: new Date(thisWeekStart.getTime() - 14 * 24 * 60 * 60 * 1000),
      isCurrent: false,
    },
  ]

  for (const msg of weeklyMessages) {
    await prisma.weeklyMessage.create({
      data: {
        ...msg,
        schoolId: school.id,
      },
    })
  }
  console.log('Created weekly messages')

  // Create Knowledge Base Categories and Articles
  const knowledgeCategories = [
    {
      name: 'The School Day',
      icon: '🕐',
      color: 'blue',
      order: 1,
      articles: [
        {
          title: 'School Timings',
          content: `**School Day Hours:**

FS1 & FS2:
• 7:45am - 1:45pm (Sunday to Thursday)

Year 1 to Year 6:
• 7:45am - 2:45pm (Sunday to Thursday)

**Drop-off:** Gates open at 7:30am
**Pick-up:** Gates open 15 minutes before end time

Late arrivals must report to reception.`,
        },
        {
          title: 'Break & Lunch Times',
          content: `**Morning Break:**
• FS1/FS2: 10:00-10:20am
• Y1-Y6: 10:15-10:35am

**Lunch:**
• FS1/FS2: 12:00-12:45pm
• Y1-Y3: 12:15-1:00pm
• Y4-Y6: 12:30-1:15pm

Healthy snacks encouraged for break time.`,
        },
      ],
    },
    {
      name: 'Uniform & Equipment',
      icon: '👔',
      color: 'purple',
      order: 2,
      articles: [
        {
          title: 'School Uniform Policy',
          content: `**Daily Uniform:**
• Burgundy polo shirt with VHPS logo
• Navy blue shorts/skort/trousers
• Black school shoes (no trainers)
• VHPS cap (outdoor activities)

**PE Kit:**
• Gold VHPS PE shirt
• Navy blue shorts
• White trainers

**Winter Months:**
Burgundy fleece available from uniform shop.`,
        },
      ],
    },
  ]

  for (const cat of knowledgeCategories) {
    const { articles, ...categoryData } = cat
    const category = await prisma.knowledgeCategory.create({
      data: {
        ...categoryData,
        schoolId: school.id,
      },
    })

    for (const article of articles) {
      await prisma.knowledgeArticle.create({
        data: {
          ...article,
          categoryId: category.id,
        },
      })
    }
  }
  console.log('Created knowledge base')

  // Create Pulse Survey
  await prisma.pulseSurvey.create({
    data: {
      halfTermName: 'Spring 1',
      status: 'OPEN',
      opensAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      closesAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      schoolId: school.id,
    },
  })
  console.log('Created pulse survey')

  // Create Policies
  const policiesData = [
    { name: 'Attendance Policy', description: 'Guidelines for student attendance and absence reporting', fileUrl: 'https://example.com/policies/attendance.pdf', fileSize: 245000 },
    { name: 'Behaviour Policy', description: 'School behaviour expectations and consequences', fileUrl: 'https://example.com/policies/behaviour.pdf', fileSize: 312000 },
    { name: 'Child Protection Policy', description: 'Safeguarding procedures and responsibilities', fileUrl: 'https://example.com/policies/child-protection.pdf', fileSize: 520000 },
    { name: 'E-Safety Policy', description: 'Online safety guidelines for students', fileUrl: 'https://example.com/policies/e-safety.pdf', fileSize: 180000 },
    { name: 'Equal Opportunities Policy', description: 'Our commitment to equality and inclusion', fileUrl: 'https://example.com/policies/equal-opportunities.pdf', fileSize: 156000 },
    { name: 'First Aid Policy', description: 'Medical and first aid procedures', fileUrl: 'https://example.com/policies/first-aid.pdf', fileSize: 203000 },
    { name: 'Health & Safety Policy', description: 'School health and safety guidelines', fileUrl: 'https://example.com/policies/health-safety.pdf', fileSize: 445000 },
    { name: 'Homework Policy', description: 'Expectations for homework across year groups', fileUrl: 'https://example.com/policies/homework.pdf', fileSize: 98000 },
    { name: 'Privacy Policy', description: 'How we handle personal data', fileUrl: 'https://example.com/policies/privacy.pdf', fileSize: 267000 },
    { name: 'Uniform Policy', description: 'School dress code requirements', fileUrl: 'https://example.com/policies/uniform.pdf', fileSize: 134000 },
  ]

  for (const policy of policiesData) {
    await prisma.policy.create({
      data: {
        ...policy,
        schoolId: school.id,
      },
    })
  }
  console.log('Created policies')

  // Create File Folders
  const formsFolder = await prisma.fileFolder.create({
    data: {
      name: 'Forms',
      icon: '📋',
      color: 'blue',
      order: 1,
      schoolId: school.id,
    },
  })

  const lettersFolder = await prisma.fileFolder.create({
    data: {
      name: 'Letters Home',
      icon: '✉️',
      color: 'green',
      order: 2,
      schoolId: school.id,
    },
  })

  const curriculumFolder = await prisma.fileFolder.create({
    data: {
      name: 'Curriculum',
      icon: '📚',
      color: 'purple',
      order: 3,
      schoolId: school.id,
    },
  })

  const photosFolder = await prisma.fileFolder.create({
    data: {
      name: 'Photos',
      icon: '📸',
      color: 'orange',
      order: 4,
      schoolId: school.id,
    },
  })

  // Create Files
  const filesData = [
    { name: 'Medical Form', fileName: 'medical-form.pdf', fileUrl: 'https://example.com/files/medical-form.pdf', fileType: 'pdf', fileSize: 125000, folderId: formsFolder.id },
    { name: 'Trip Consent Form', fileName: 'trip-consent.pdf', fileUrl: 'https://example.com/files/trip-consent.pdf', fileType: 'pdf', fileSize: 98000, folderId: formsFolder.id },
    { name: 'Photo Permission Form', fileName: 'photo-permission.pdf', fileUrl: 'https://example.com/files/photo-permission.pdf', fileType: 'pdf', fileSize: 87000, folderId: formsFolder.id },
    { name: 'Welcome Letter - January 2026', fileName: 'welcome-jan-2026.pdf', fileUrl: 'https://example.com/files/welcome-jan-2026.pdf', fileType: 'pdf', fileSize: 156000, folderId: lettersFolder.id },
    { name: 'Term 2 Newsletter', fileName: 'newsletter-term2.pdf', fileUrl: 'https://example.com/files/newsletter-term2.pdf', fileType: 'pdf', fileSize: 2450000, folderId: lettersFolder.id },
    { name: 'English Curriculum Overview', fileName: 'english-curriculum.pdf', fileUrl: 'https://example.com/files/english-curriculum.pdf', fileType: 'pdf', fileSize: 345000, folderId: curriculumFolder.id },
    { name: 'Maths Curriculum Overview', fileName: 'maths-curriculum.pdf', fileUrl: 'https://example.com/files/maths-curriculum.pdf', fileType: 'pdf', fileSize: 312000, folderId: curriculumFolder.id },
    { name: 'Winter Concert 2025', fileName: 'winter-concert-2025.jpg', fileUrl: 'https://example.com/files/winter-concert.jpg', fileType: 'jpg', fileSize: 4500000, folderId: photosFolder.id },
    { name: 'Sports Day 2025', fileName: 'sports-day-2025.jpg', fileUrl: 'https://example.com/files/sports-day.jpg', fileType: 'jpg', fileSize: 3800000, folderId: photosFolder.id },
  ]

  for (const file of filesData) {
    await prisma.schoolFile.create({
      data: {
        ...file,
        schoolId: school.id,
      },
    })
  }
  console.log('Created files and folders')

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
