import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get active surveys (filtered by user's children's classes)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const childClassIds = user.children?.map(c => c.classId) || []
    const now = new Date()

    const surveys = await prisma.survey.findMany({
      where: {
        schoolId: user.schoolId,
        active: true,
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: childClassIds } },
        ],
        // Filter out expired surveys for parents
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
        ],
      },
      include: {
        responses: {
          where: { userId: user.id },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(surveys.map(survey => ({
      id: survey.id,
      question: survey.question,
      options: survey.options as string[],
      active: survey.active,
      targetClass: survey.targetClass,
      classId: survey.classId,
      schoolId: survey.schoolId,
      expiresAt: survey.expiresAt?.toISOString(),
      userResponse: survey.responses[0]?.response || null,
      createdAt: survey.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching surveys:', error)
    res.status(500).json({ error: 'Failed to fetch surveys' })
  }
})

// Get all surveys with responses (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const surveys = await prisma.survey.findMany({
      where: { schoolId: user.schoolId },
      include: {
        responses: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    res.json(surveys.map(survey => ({
      id: survey.id,
      question: survey.question,
      options: survey.options as string[],
      active: survey.active,
      targetClass: survey.targetClass,
      classId: survey.classId,
      schoolId: survey.schoolId,
      expiresAt: survey.expiresAt?.toISOString(),
      isExpired: survey.expiresAt ? survey.expiresAt < now : false,
      responses: survey.responses.map(r => ({
        id: r.id,
        response: r.response,
        userName: r.user.name,
        userEmail: r.user.email,
        createdAt: r.createdAt.toISOString(),
      })),
      createdAt: survey.createdAt.toISOString(),
      updatedAt: survey.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching all surveys:', error)
    res.status(500).json({ error: 'Failed to fetch surveys' })
  }
})

// Create survey (admin only)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { question, options, targetClass, classId, expiresAt } = req.body

    const survey = await prisma.survey.create({
      data: {
        question,
        options,
        targetClass,
        classId: classId || null,
        schoolId: user.schoolId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    res.status(201).json({
      id: survey.id,
      question: survey.question,
      options: survey.options as string[],
      active: survey.active,
      targetClass: survey.targetClass,
      classId: survey.classId,
      schoolId: survey.schoolId,
      expiresAt: survey.expiresAt?.toISOString(),
      createdAt: survey.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating survey:', error)
    res.status(500).json({ error: 'Failed to create survey' })
  }
})

// Submit survey response
router.post('/:id/respond', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { response } = req.body

    const surveyResponse = await prisma.surveyResponse.upsert({
      where: {
        surveyId_userId: {
          surveyId: id,
          userId: user.id,
        },
      },
      update: { response },
      create: {
        surveyId: id,
        userId: user.id,
        response,
      },
    })

    res.json({
      id: surveyResponse.id,
      surveyId: surveyResponse.surveyId,
      userId: surveyResponse.userId,
      response: surveyResponse.response,
      createdAt: surveyResponse.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error submitting survey response:', error)
    res.status(500).json({ error: 'Failed to submit response' })
  }
})

// Close survey (admin only)
router.patch('/:id/close', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const survey = await prisma.survey.update({
      where: { id },
      data: { active: false },
    })

    res.json({
      id: survey.id,
      active: survey.active,
    })
  } catch (error) {
    console.error('Error closing survey:', error)
    res.status(500).json({ error: 'Failed to close survey' })
  }
})

// Update survey (admin only)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { question, options, targetClass, classId, active, expiresAt } = req.body

    // Verify survey belongs to user's school
    const existing = await prisma.survey.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Survey not found' })
    }

    const survey = await prisma.survey.update({
      where: { id },
      data: {
        question,
        options,
        targetClass,
        classId: classId || null,
        active: active ?? existing.active,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    res.json({
      id: survey.id,
      question: survey.question,
      options: survey.options as string[],
      active: survey.active,
      targetClass: survey.targetClass,
      classId: survey.classId,
      schoolId: survey.schoolId,
      expiresAt: survey.expiresAt?.toISOString(),
      createdAt: survey.createdAt.toISOString(),
      updatedAt: survey.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating survey:', error)
    res.status(500).json({ error: 'Failed to update survey' })
  }
})

// Delete survey (admin only)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    // Verify survey belongs to user's school
    const existing = await prisma.survey.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Survey not found' })
    }

    await prisma.survey.delete({
      where: { id },
    })

    res.json({ message: 'Survey deleted successfully' })
  } catch (error) {
    console.error('Error deleting survey:', error)
    res.status(500).json({ error: 'Failed to delete survey' })
  }
})

export default router
