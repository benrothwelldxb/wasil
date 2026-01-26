import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

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
      questions: PULSE_CORE_QUESTIONS,
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
      questions: PULSE_CORE_QUESTIONS,
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
      questions: PULSE_CORE_QUESTIONS,
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

// Create pulse survey (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { halfTermName, status, opensAt, closesAt } = req.body

    const pulse = await prisma.pulseSurvey.create({
      data: {
        halfTermName,
        status: status || 'DRAFT',
        opensAt: new Date(opensAt),
        closesAt: new Date(closesAt),
        schoolId: user.schoolId,
      },
    })

    res.status(201).json({
      id: pulse.id,
      halfTermName: pulse.halfTermName,
      status: pulse.status,
      opensAt: pulse.opensAt.toISOString(),
      closesAt: pulse.closesAt.toISOString(),
      schoolId: pulse.schoolId,
      questions: PULSE_CORE_QUESTIONS,
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
