import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'

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

// Helper to build questions list for a pulse
function getQuestionsForPulse(additionalQuestionKey: string | null) {
  const questions = [...PULSE_CORE_QUESTIONS]
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

    res.json(pulses.map(pulse => ({
      id: pulse.id,
      halfTermName: pulse.halfTermName,
      status: pulse.status,
      opensAt: pulse.opensAt.toISOString(),
      closesAt: pulse.closesAt.toISOString(),
      schoolId: pulse.schoolId,
      additionalQuestionKey: pulse.additionalQuestionKey,
      questions: getQuestionsForPulse(pulse.additionalQuestionKey),
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
      questions: getQuestionsForPulse(pulse.additionalQuestionKey),
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

    const pulse = await prisma.pulseSurvey.findUnique({
      where: { id },
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
      questions: getQuestionsForPulse(pulse.additionalQuestionKey),
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

    // Count total parents in school
    const totalParents = await prisma.user.count({
      where: { schoolId: user.schoolId, role: 'PARENT' },
    })

    const responseCount = pulse.responses.length
    const responseRate = totalParents > 0 ? Math.round((responseCount / totalParents) * 100) : 0

    // Build questions list for this pulse
    const questions = getQuestionsForPulse(pulse.additionalQuestionKey)

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
    const totalParents = await prisma.user.count({
      where: { schoolId: user.schoolId, role: 'PARENT' },
    })

    // Build questions list
    const questions = getQuestionsForPulse(pulse.additionalQuestionKey)

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
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { halfTermName, status, opensAt, closesAt, additionalQuestionKey } = req.body

    const pulse = await prisma.pulseSurvey.create({
      data: {
        halfTermName,
        status: status || 'DRAFT',
        opensAt: new Date(opensAt),
        closesAt: new Date(closesAt),
        additionalQuestionKey: additionalQuestionKey || null,
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
      questions: getQuestionsForPulse(pulse.additionalQuestionKey),
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

    const pulse = await prisma.pulseSurvey.update({
      where: { id },
      data: {
        status: 'OPEN',
        opensAt: new Date(),
      },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'PULSE_SURVEY', resourceId: pulse.id, metadata: { action: 'send' } })
    sendNotification({ req, type: 'PULSE', title: 'Parent Pulse Survey', body: `The ${pulse.halfTermName} pulse survey is now open`, resourceType: 'PULSE_SURVEY', resourceId: pulse.id, target: { targetClass: 'Whole School', schoolId: pulse.schoolId } })

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
    const { halfTermName, opensAt, closesAt, additionalQuestionKey } = req.body

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
      questions: getQuestionsForPulse(pulse.additionalQuestionKey),
      responseCount: pulse._count.responses,
      createdAt: pulse.createdAt.toISOString(),
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'PULSE_SURVEY', resourceId: pulse.id, metadata: { halfTermName: pulse.halfTermName } })
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

// Close pulse (admin only)
router.post('/:id/close', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

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
