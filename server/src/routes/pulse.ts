import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit, computeChanges } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'
import { audienceOf, pulseAudienceParentIds } from '../services/pulseAudience.js'

const router = Router()

// Core pulse questions (constant)
const PULSE_CORE_QUESTIONS = [
  { id: 'q1', stableKey: 'core_quality', text: 'I feel confident that the school is providing my child with a high-quality education.', type: 'LIKERT_5', order: 1 },
  { id: 'q2', stableKey: 'core_belonging', text: 'My child feels happy, safe, and a sense of belonging at school.', type: 'LIKERT_5', order: 2 },
  { id: 'q3', stableKey: 'core_communication', text: 'The school communicates clearly and in a timely way.', type: 'LIKERT_5', order: 3 },
  { id: 'q4', stableKey: 'core_responsiveness', text: 'When I have a question or concern, I know who to contact and feel listened to.', type: 'LIKERT_5', order: 4 },
  { id: 'q5', stableKey: 'core_expectations', text: "The school's expectations for behaviour, learning, and routines are clear and reasonable.", type: 'LIKERT_5', order: 5 },
  { id: 'q6', stableKey: 'core_overall_satisfaction', text: "Overall, I am satisfied with my family's experience of the school.", type: 'LIKERT_5', order: 6 },
  { id: 'q7', stableKey: 'core_improve_now', text: 'Is there one thing the school could do to improve your experience right now?', type: 'TEXT_OPTIONAL', order: 7 },
]

// Optional additional questions
const OPTIONAL_QUESTIONS = [
  { key: 'opt_homework', text: 'I am satisfied with the level of homework my child receives.', type: 'LIKERT_5' },
  { key: 'opt_extracurricular', text: 'The school offers a good range of extracurricular activities.', type: 'LIKERT_5' },
  { key: 'opt_pastoral', text: 'The pastoral care and support for my child is excellent.', type: 'LIKERT_5' },
  { key: 'opt_facilities', text: 'The school facilities meet my expectations.', type: 'LIKERT_5' },
  { key: 'opt_leadership', text: 'I have confidence in the school leadership.', type: 'LIKERT_5' },
  { key: 'opt_inclusion', text: 'The school is inclusive and celebrates diversity.', type: 'LIKERT_5' },
  { key: 'opt_feedback', text: 'I receive useful feedback about my child\'s progress.', type: 'LIKERT_5' },
  { key: 'opt_transition', text: 'The school has supported my child well during transitions.', type: 'LIKERT_5' },
]

interface CustomQuestion {
  id: string
  text: string
  type: 'LIKERT_5' | 'TEXT_OPTIONAL'
}

/** Every core question's stable key — the default for a new survey, and what
 *  every existing survey was backfilled to. */
export const ALL_CORE_KEYS = PULSE_CORE_QUESTIONS.map(q => q.stableKey)

/**
 * Build the question list for one survey.
 *
 * `coreQuestionKeys` decides which of the seven core questions it asks. They
 * used to be mandatory, so every pulse was eight questions whatever it was for
 * — a "how has the start of the year felt" survey still asked about homework
 * feedback and behaviour expectations, and the length is what stops people
 * answering.
 *
 * Selected by STABLE KEY rather than position, so a survey keeps asking the
 * same question if the wording is revised, and answers stay comparable across
 * the year. Order is preserved from the core list rather than from the
 * selection, so two surveys asking the same four questions ask them in the
 * same order.
 */
function getQuestionsForPulse(
  additionalQuestionKey: string | null,
  customQuestions?: CustomQuestion[] | null,
  coreQuestionKeys?: string[] | null,
) {
  // Null or undefined means "all" — a survey created before this existed, and
  // read by a code path that has not been given the column. An EMPTY ARRAY is
  // a real choice and means none; the migration backfilled every existing row
  // so the two can be told apart.
  const wanted = coreQuestionKeys == null ? ALL_CORE_KEYS : coreQuestionKeys
  const questions = PULSE_CORE_QUESTIONS.filter(q => wanted.includes(q.stableKey))
    .map((q, i) => ({ ...q, order: i + 1 }))

  // Legacy: single optional question from preset list
  if (additionalQuestionKey) {
    const optionalQ = OPTIONAL_QUESTIONS.find(q => q.key === additionalQuestionKey)
    if (optionalQ) {
      questions.push({
        id: 'q8',
        stableKey: optionalQ.key,
        text: optionalQ.text,
        type: optionalQ.type,
        order: 8,
      })
    }
  }

  // Custom questions added by admin
  if (customQuestions && Array.isArray(customQuestions)) {
    customQuestions.forEach((cq, idx) => {
      questions.push({
        id: cq.id,
        stableKey: cq.id,
        text: cq.text,
        type: cq.type,
        order: questions.length + 1,
      })
    })
  }

  return questions
}

// Get available optional questions (admin)
router.get('/optional-questions', isAdmin, async (_req, res) => {
  res.json(OPTIONAL_QUESTIONS)
})

// Get pulse surveys (for parents)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const pulses = await prisma.pulseSurvey.findMany({
      where: {
        schoolId: user.schoolId,
        status: { in: ['OPEN', 'CLOSED'] },
      },
      include: {
        responses: {
          where: { userId: user.id },
        },
      },
      orderBy: { opensAt: 'desc' },
    })

    // Only the surveys this parent is actually part of. Filtered here rather
    // than refused at submit time: a survey that appears and then declines to
    // accept an answer wastes the one moment somebody was willing to give.
    //
    // Cached per audience shape, so a school running three scoped pulses costs
    // three lookups rather than one per survey per family.
    const visible: typeof pulses = []
    const audienceCache = new Map<string, string[]>()
    for (const pulse of pulses) {
      const audience = audienceOf(pulse)
      if (audience.type === 'SCHOOL') { visible.push(pulse); continue }
      const key = `${audience.type}:${pulse.audienceGroupId ?? ''}:${(pulse.audienceYearGroupIds || []).join(',')}`
      let ids = audienceCache.get(key)
      if (!ids) {
        ids = await pulseAudienceParentIds(user.schoolId, audience)
        audienceCache.set(key, ids)
      }
      if (ids.includes(user.id)) visible.push(pulse)
    }
    res.json(visible.map(pulse => ({
      id: pulse.id,
      halfTermName: pulse.halfTermName,
      status: pulse.status,
      opensAt: pulse.opensAt.toISOString(),
      closesAt: pulse.closesAt.toISOString(),
      schoolId: pulse.schoolId,
      additionalQuestionKey: pulse.additionalQuestionKey,
      questions: getQuestionsForPulse(pulse.additionalQuestionKey, pulse.customQuestions as CustomQuestion[] | null, pulse.coreQuestionKeys),
      userResponse: pulse.responses[0] ? {
        id: pulse.responses[0].id,
        answers: pulse.responses[0].answers as Record<string, number | string>,
        createdAt: pulse.responses[0].createdAt.toISOString(),
      } : null,
      createdAt: pulse.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching pulse surveys:', error)
    res.status(500).json({ error: 'Failed to fetch pulse surveys' })
  }
})

// Get all pulse surveys with details (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const pulses = await prisma.pulseSurvey.findMany({
      where: { schoolId: user.schoolId },
      include: {
        _count: { select: { responses: true } },
        responses: true,
      },
      orderBy: { opensAt: 'desc' },
    })

    res.json(pulses.map(pulse => ({
      id: pulse.id,
      halfTermName: pulse.halfTermName,
      status: pulse.status,
      opensAt: pulse.opensAt.toISOString(),
      closesAt: pulse.closesAt.toISOString(),
      schoolId: pulse.schoolId,
      additionalQuestionKey: pulse.additionalQuestionKey,
      questions: getQuestionsForPulse(pulse.additionalQuestionKey, pulse.customQuestions as CustomQuestion[] | null, pulse.coreQuestionKeys),
      // The selection and audience as STORED, so the edit form opens showing
      // what this survey actually is rather than a fresh default — which would
      // quietly widen a scoped survey the first time somebody fixed a typo.
      coreQuestionKeys: pulse.coreQuestionKeys,
      customQuestions: pulse.customQuestions,
      audienceType: pulse.audienceType,
      audienceGroupId: pulse.audienceGroupId,
      audienceYearGroupIds: pulse.audienceYearGroupIds,
      responseCount: pulse._count.responses,
      responses: pulse.responses.map(r => ({
        id: r.id,
        answers: r.answers as Record<string, number | string>,
        createdAt: r.createdAt.toISOString(),
      })),
      createdAt: pulse.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching all pulse surveys:', error)
    res.status(500).json({ error: 'Failed to fetch pulse surveys' })
  }
})

// Get pulse survey details (admin)
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const pulse = await prisma.pulseSurvey.findFirst({
      where: { id, schoolId: req.user!.schoolId },
      include: {
        responses: true,
      },
    })

    if (!pulse) {
      return res.status(404).json({ error: 'Pulse survey not found' })
    }

    res.json({
      id: pulse.id,
      halfTermName: pulse.halfTermName,
      status: pulse.status,
      opensAt: pulse.opensAt.toISOString(),
      closesAt: pulse.closesAt.toISOString(),
      schoolId: pulse.schoolId,
      additionalQuestionKey: pulse.additionalQuestionKey,
      questions: getQuestionsForPulse(pulse.additionalQuestionKey, pulse.customQuestions as CustomQuestion[] | null, pulse.coreQuestionKeys),
      responses: pulse.responses.map(r => ({
        id: r.id,
        answers: r.answers as Record<string, number | string>,
        createdAt: r.createdAt.toISOString(),
      })),
      createdAt: pulse.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching pulse survey:', error)
    res.status(500).json({ error: 'Failed to fetch pulse survey' })
  }
})

// Get pulse analytics (admin)
router.get('/:id/analytics', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Fetch pulse with responses
    const pulse = await prisma.pulseSurvey.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { responses: true },
    })

    if (!pulse) {
      return res.status(404).json({ error: 'Pulse survey not found' })
    }

    // THE AUDIENCE IS THE DENOMINATOR.
    //
    // This counted every parent in the school, which is right only for a
    // school-wide pulse. A survey sent to 30 new parents that scored its 12
    // replies against 400 families would report a 3% response to something
    // nearly half its audience answered — and a school reading 3% concludes
    // the survey failed and stops sending them.
    const totalParents = (await pulseAudienceParentIds(user.schoolId, audienceOf(pulse))).length

    const responseCount = pulse.responses.length
    const responseRate = totalParents > 0 ? Math.round((responseCount / totalParents) * 100) : 0

    // Build questions list for this pulse
    const questions = getQuestionsForPulse(pulse.additionalQuestionKey, pulse.customQuestions as CustomQuestion[] | null, pulse.coreQuestionKeys)

    // Calculate stats for each question
    const questionStats: Record<string, {
      question: string
      type: string
      average?: number
      distribution?: Record<number, number>
      responses?: string[]
    }> = {}

    for (const q of questions) {
      const qKey = q.id // e.g., 'q1', 'q2', etc.

      if (q.type === 'LIKERT_5') {
        // Collect all numeric answers for this question
        const scores: number[] = []
        const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

        for (const response of pulse.responses) {
          const answers = response.answers as Record<string, number | string>
          const value = answers[qKey]
          if (typeof value === 'number' && value >= 1 && value <= 5) {
            scores.push(value)
            distribution[value]++
          }
        }

        const average = scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : undefined

        questionStats[qKey] = {
          question: q.text,
          type: q.type,
          average,
          distribution,
        }
      } else if (q.type === 'TEXT_OPTIONAL') {
        // Collect text responses
        const textResponses: string[] = []
        for (const response of pulse.responses) {
          const answers = response.answers as Record<string, number | string>
          const value = answers[qKey]
          if (typeof value === 'string' && value.trim()) {
            textResponses.push(value.trim())
          }
        }

        questionStats[qKey] = {
          question: q.text,
          type: q.type,
          responses: textResponses,
        }
      }
    }

    res.json({
      responseCount,
      totalParents,
      responseRate,
      questionStats,
    })
  } catch (error) {
    console.error('Error fetching pulse analytics:', error)
    res.status(500).json({ error: 'Failed to fetch analytics' })
  }
})

// Export pulse analytics as CSV (admin only)
router.get('/:id/export', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const pulse = await prisma.pulseSurvey.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        responses: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                children: {
                  select: {
                    name: true,
                    class: { select: { name: true } },
                  },
                },
                studentLinks: {
                  select: {
                    student: {
                      select: {
                        firstName: true,
                        lastName: true,
                        class: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!pulse) {
      return res.status(404).json({ error: 'Pulse survey not found' })
    }

    // Get total parents count
    // The audience, not the school — the same reasoning as the results view.
    // A CSV that reports a rate against the wrong denominator is worse than
    // one that omits it, because it will be pasted into a governors' report.
    const totalParents = (await pulseAudienceParentIds(user.schoolId, audienceOf(pulse))).length

    // Build questions list
    const questions = getQuestionsForPulse(pulse.additionalQuestionKey, pulse.customQuestions as CustomQuestion[] | null, pulse.coreQuestionKeys)

    // Build CSV header
    const headers = [
      'Parent Name',
      'Parent Email',
      'Children',
      'Classes',
      ...questions.map(q => q.text.substring(0, 50) + (q.text.length > 50 ? '...' : '')),
      'Submitted At',
    ]

    // Build CSV rows
    const rows = pulse.responses.map(response => {
      const answers = response.answers as Record<string, number | string>

      // Get children info
      const childrenFromOld = response.user.children?.map(c => c.name) || []
      const childrenFromNew = response.user.studentLinks?.map(sl => `${sl.student.firstName} ${sl.student.lastName}`) || []
      const allChildren = [...childrenFromOld, ...childrenFromNew]

      const classesFromOld = response.user.children?.map(c => c.class.name) || []
      const classesFromNew = response.user.studentLinks?.map(sl => sl.student.class.name) || []
      const allClasses = [...new Set([...classesFromOld, ...classesFromNew])]

      const questionValues = questions.map(q => {
        const val = answers[q.id]
        if (val === undefined || val === null) return ''
        return String(val)
      })

      return [
        response.user.name,
        response.user.email,
        allChildren.join('; '),
        allClasses.join('; '),
        ...questionValues,
        new Date(response.createdAt).toISOString(),
      ]
    })

    // Calculate summary stats for Likert questions
    const summaryRows: string[][] = []
    summaryRows.push([])
    summaryRows.push(['SUMMARY'])
    summaryRows.push(['Total Parents', String(totalParents)])
    summaryRows.push(['Total Responses', String(pulse.responses.length)])
    summaryRows.push(['Response Rate', `${totalParents > 0 ? Math.round((pulse.responses.length / totalParents) * 100) : 0}%`])
    summaryRows.push([])
    summaryRows.push(['Question', 'Type', 'Average', 'Count'])

    for (const q of questions) {
      if (q.type === 'LIKERT_5') {
        const scores: number[] = []
        for (const response of pulse.responses) {
          const answers = response.answers as Record<string, number | string>
          const val = answers[q.id]
          if (typeof val === 'number' && val >= 1 && val <= 5) {
            scores.push(val)
          }
        }
        const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 'N/A'
        summaryRows.push([q.text.substring(0, 80), 'Likert 1-5', avg, String(scores.length)])
      } else {
        const textCount = pulse.responses.filter(r => {
          const answers = r.answers as Record<string, number | string>
          const val = answers[q.id]
          return typeof val === 'string' && val.trim().length > 0
        }).length
        summaryRows.push([q.text.substring(0, 80), 'Text', 'N/A', String(textCount)])
      }
    }

    // Convert to CSV
    const escapeCSV = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return val
    }

    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(',')),
      ...summaryRows.map(row => row.map(escapeCSV).join(',')),
    ].join('\n')

    // Set headers for CSV download
    const filename = `pulse_${pulse.halfTermName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csvContent)
  } catch (error) {
    console.error('Error exporting pulse responses:', error)
    res.status(500).json({ error: 'Failed to export responses' })
  }
})

// Create pulse survey (admin only)
/**
 * Read the question selection and audience off a request body.
 *
 * Shared by create and update so the two cannot drift — a survey that accepted
 * an audience on creation and silently dropped it on edit would be the kind of
 * fault nobody notices until a scoped pulse goes to everybody.
 *
 * Returns a string on refusal rather than throwing, so the caller decides the
 * status code.
 */
function readScoping(body: Record<string, unknown>):
  | { error: string }
  | {
      coreQuestionKeys: string[]
      audienceType: string
      audienceGroupId: string | null
      audienceYearGroupIds: string[]
    } {
  // Absent means "all seven" — an older admin bundle that does not know about
  // the selection yet must not quietly create a survey that asks nothing.
  const rawKeys = body.coreQuestionKeys
  const coreQuestionKeys = Array.isArray(rawKeys)
    ? rawKeys.filter((k): k is string => typeof k === 'string' && ALL_CORE_KEYS.includes(k))
    : ALL_CORE_KEYS

  const audienceType = typeof body.audienceType === 'string' ? body.audienceType : 'SCHOOL'
  if (!['SCHOOL', 'GROUP', 'YEAR_GROUPS'].includes(audienceType)) {
    return { error: 'Unknown audience' }
  }

  const audienceGroupId =
    audienceType === 'GROUP' && typeof body.audienceGroupId === 'string' && body.audienceGroupId.trim()
      ? body.audienceGroupId.trim()
      : null
  const audienceYearGroupIds =
    audienceType === 'YEAR_GROUPS' && Array.isArray(body.audienceYearGroupIds)
      ? (body.audienceYearGroupIds as unknown[]).filter((v): v is string => typeof v === 'string')
      : []

  // A scoped survey with nothing to scope TO would silently reach nobody, and
  // the school would read the empty result as apathy.
  if (audienceType === 'GROUP' && !audienceGroupId) {
    return { error: 'Choose which group this survey is for' }
  }
  if (audienceType === 'YEAR_GROUPS' && audienceYearGroupIds.length === 0) {
    return { error: 'Choose at least one year group' }
  }

  return { coreQuestionKeys, audienceType, audienceGroupId, audienceYearGroupIds }
}

router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { halfTermName, status, opensAt, closesAt, additionalQuestionKey, customQuestions } = req.body

    const scoping = readScoping(req.body || {})
    if ('error' in scoping) return res.status(400).json({ error: scoping.error })

    const pulse = await prisma.pulseSurvey.create({
      data: {
        halfTermName,
        status: status || 'DRAFT',
        opensAt: new Date(opensAt),
        closesAt: new Date(closesAt),
        additionalQuestionKey: additionalQuestionKey || null,
        customQuestions: customQuestions && customQuestions.length > 0 ? JSON.parse(JSON.stringify(customQuestions)) : undefined,
        coreQuestionKeys: scoping.coreQuestionKeys,
        audienceType: scoping.audienceType,
        audienceGroupId: scoping.audienceGroupId,
        audienceYearGroupIds: scoping.audienceYearGroupIds,
        schoolId: user.schoolId,
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'PULSE_SURVEY', resourceId: pulse.id, metadata: { halfTermName: pulse.halfTermName } })

    res.status(201).json({
      id: pulse.id,
      halfTermName: pulse.halfTermName,
      status: pulse.status,
      opensAt: pulse.opensAt.toISOString(),
      closesAt: pulse.closesAt.toISOString(),
      schoolId: pulse.schoolId,
      additionalQuestionKey: pulse.additionalQuestionKey,
      questions: getQuestionsForPulse(pulse.additionalQuestionKey, pulse.customQuestions as CustomQuestion[] | null, pulse.coreQuestionKeys),
      responseCount: 0,
      createdAt: pulse.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating pulse survey:', error)
    res.status(500).json({ error: 'Failed to create pulse survey' })
  }
})

// Submit pulse response
router.post('/:id/respond', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { answers } = req.body

    // Check if pulse is open
    const pulse = await prisma.pulseSurvey.findUnique({
      where: { id },
    })

    if (!pulse || pulse.status !== 'OPEN') {
      return res.status(400).json({ error: 'Pulse survey is not open for responses' })
    }

    const response = await prisma.pulseResponse.upsert({
      where: {
        pulseId_userId: {
          pulseId: id,
          userId: user.id,
        },
      },
      update: { answers },
      create: {
        pulseId: id,
        userId: user.id,
        answers,
      },
    })

    res.json({
      id: response.id,
      pulseId: response.pulseId,
      userId: response.userId,
      answers: response.answers as Record<string, number | string>,
      createdAt: response.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error submitting pulse response:', error)
    res.status(500).json({ error: 'Failed to submit response' })
  }
})

// Send pulse now (admin only)
router.post('/:id/send', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Tenant guard: an admin must not open another school's survey (which would
    // push a notification to that school's whole parent body).
    const owned = await prisma.pulseSurvey.findFirst({
      where: { id, schoolId: req.user!.schoolId },
      select: { id: true },
    })
    if (!owned) {
      return res.status(404).json({ error: 'Pulse survey not found' })
    }

    const pulse = await prisma.pulseSurvey.update({
      where: { id },
      data: {
        status: 'OPEN',
        opensAt: new Date(),
      },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'PULSE_SURVEY', resourceId: pulse.id, metadata: { action: 'send' } })
    // Notified to the AUDIENCE, resolved the same way the parent list resolves
    // it. Pushing a scoped survey to the whole school would be the loudest
    // possible way to tell four hundred families about something thirty of
    // them can answer — and the ones who tapped it would find nothing there.
    const audience = audienceOf(pulse)
    if (audience.type === 'SCHOOL') {
      sendNotification({ req, type: 'PULSE_SURVEY', title: 'Parent Pulse Survey', body: `The ${pulse.halfTermName} pulse survey is now open`, resourceType: 'PULSE_SURVEY', resourceId: pulse.id, target: { targetClass: 'Whole School', schoolId: pulse.schoolId } })
    } else {
      const parentUserIds = await pulseAudienceParentIds(pulse.schoolId, audience)
      if (parentUserIds.length > 0) {
        sendNotification({ req, type: 'PULSE_SURVEY', title: 'Parent Pulse Survey', body: `The ${pulse.halfTermName} pulse survey is now open`, resourceType: 'PULSE_SURVEY', resourceId: pulse.id, target: { targetClass: 'Pulse', schoolId: pulse.schoolId, parentUserIds } })
      }
    }

    res.json({
      id: pulse.id,
      status: pulse.status,
      opensAt: pulse.opensAt.toISOString(),
    })
  } catch (error) {
    console.error('Error sending pulse:', error)
    res.status(500).json({ error: 'Failed to send pulse' })
  }
})

// Update pulse survey (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { halfTermName, opensAt, closesAt, additionalQuestionKey, customQuestions } = req.body

    const scoping = readScoping(req.body || {})
    if ('error' in scoping) return res.status(400).json({ error: scoping.error })

    // Verify pulse belongs to user's school
    const existing = await prisma.pulseSurvey.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Pulse survey not found' })
    }

    const pulse = await prisma.pulseSurvey.update({
      where: { id },
      data: {
        halfTermName,
        opensAt: new Date(opensAt),
        closesAt: new Date(closesAt),
        additionalQuestionKey: additionalQuestionKey !== undefined ? (additionalQuestionKey || null) : existing.additionalQuestionKey,
        ...(customQuestions !== undefined && { customQuestions: customQuestions && customQuestions.length > 0 ? JSON.parse(JSON.stringify(customQuestions)) : null }),
        // Applied on edit as well as creation. A survey that accepted an
        // audience when made and silently dropped it when edited is the kind
        // of fault nobody notices until a scoped pulse goes to everybody.
        coreQuestionKeys: scoping.coreQuestionKeys,
        audienceType: scoping.audienceType,
        audienceGroupId: scoping.audienceGroupId,
        audienceYearGroupIds: scoping.audienceYearGroupIds,
      },
      include: {
        _count: { select: { responses: true } },
      },
    })

    res.json({
      id: pulse.id,
      halfTermName: pulse.halfTermName,
      status: pulse.status,
      opensAt: pulse.opensAt.toISOString(),
      closesAt: pulse.closesAt.toISOString(),
      schoolId: pulse.schoolId,
      additionalQuestionKey: pulse.additionalQuestionKey,
      questions: getQuestionsForPulse(pulse.additionalQuestionKey, pulse.customQuestions as CustomQuestion[] | null, pulse.coreQuestionKeys),
      responseCount: pulse._count.responses,
      createdAt: pulse.createdAt.toISOString(),
    })

    const changes = computeChanges(existing as any, pulse as any, ['halfTermName', 'status'])
    logAudit({ req, action: 'UPDATE', resourceType: 'PULSE_SURVEY', resourceId: pulse.id, metadata: { halfTermName: pulse.halfTermName }, changes })
  } catch (error) {
    console.error('Error updating pulse survey:', error)
    res.status(500).json({ error: 'Failed to update pulse survey' })
  }
})

// Delete pulse survey (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify pulse belongs to user's school
    const existing = await prisma.pulseSurvey.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Pulse survey not found' })
    }

    await prisma.pulseSurvey.delete({
      where: { id },
    })

    logAudit({ req, action: 'DELETE', resourceType: 'PULSE_SURVEY', resourceId: id, metadata: { halfTermName: existing.halfTermName } })

    res.json({ message: 'Pulse survey deleted successfully' })
  } catch (error) {
    console.error('Error deleting pulse survey:', error)
    res.status(500).json({ error: 'Failed to delete pulse survey' })
  }
})

// Term-over-term comparison (admin)
router.get('/comparison', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const pulses = await prisma.pulseSurvey.findMany({
      where: { schoolId: user.schoolId, status: 'CLOSED' },
      include: { responses: true },
      orderBy: { opensAt: 'asc' },
    })

    const comparison: Array<{
      id: string
      halfTermName: string
      responseCount: number
      coreAverages: Record<string, number | null>
    }> = []

    for (const pulse of pulses) {
      const coreAverages: Record<string, number | null> = {}

      for (const q of PULSE_CORE_QUESTIONS) {
        if (q.type !== 'LIKERT_5') continue
        const scores: number[] = []
        for (const r of pulse.responses) {
          const answers = r.answers as Record<string, number | string>
          const val = answers[q.id]
          if (typeof val === 'number' && val >= 1 && val <= 5) scores.push(val)
        }
        coreAverages[q.stableKey] = scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : null
      }

      comparison.push({
        id: pulse.id,
        halfTermName: pulse.halfTermName,
        responseCount: pulse.responses.length,
        coreAverages,
      })
    }

    res.json({ comparison })
  } catch (error) {
    console.error('Error fetching pulse comparison:', error)
    res.status(500).json({ error: 'Failed to fetch comparison' })
  }
})

// Close pulse (admin only)
router.post('/:id/close', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Tenant guard: an admin must not force-close another school's survey.
    const owned = await prisma.pulseSurvey.findFirst({
      where: { id, schoolId: req.user!.schoolId },
      select: { id: true },
    })
    if (!owned) {
      return res.status(404).json({ error: 'Pulse survey not found' })
    }

    const pulse = await prisma.pulseSurvey.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closesAt: new Date(),
      },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'PULSE_SURVEY', resourceId: pulse.id, metadata: { action: 'close' } })

    res.json({
      id: pulse.id,
      status: pulse.status,
      closesAt: pulse.closesAt.toISOString(),
    })
  } catch (error) {
    console.error('Error closing pulse:', error)
    res.status(500).json({ error: 'Failed to close pulse' })
  }
})

export default router
