import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get active surveys (filtered by user's children's classes)
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const childClassIds = user.children?.map(c => c.classId) || []

    const surveys = await prisma.survey.findMany({
      where: {
        schoolId: user.schoolId,
        active: true,
        OR: [
          { targetClass: 'Whole School' },
          { classId: { in: childClassIds } },
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

    res.json(surveys.map(survey => ({
      id: survey.id,
      question: survey.question,
      options: survey.options as string[],
      active: survey.active,
      targetClass: survey.targetClass,
      classId: survey.classId,
      schoolId: survey.schoolId,
      responses: survey.responses.map(r => ({
        id: r.id,
        response: r.response,
        userName: r.user.name,
        userEmail: r.user.email,
        createdAt: r.createdAt.toISOString(),
      })),
      createdAt: survey.createdAt.toISOString(),
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
    const { question, options, targetClass, classId } = req.body

    const survey = await prisma.survey.create({
      data: {
        question,
        options,
        targetClass,
        classId: classId || null,
        schoolId: user.schoolId,
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

export default router
