import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin } from '../middleware/auth.js'

const router = Router()

// Simple in-memory cache (5-minute TTL)
const cache = new Map<string, { data: unknown; expires: number }>()
function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (entry && entry.expires > Date.now()) return entry.data as T
  cache.delete(key)
  return null
}
function setCache(key: string, data: unknown, ttlMs = 5 * 60 * 1000) {
  cache.set(key, { data, expires: Date.now() + ttlMs })
}

// GET /api/analytics/overview
router.get('/overview', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const schoolId = user.schoolId
    const cacheKey = `overview:${schoolId}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Total parents
    const totalParents = await prisma.user.count({
      where: { schoolId, role: 'PARENT' },
    })

    // Active parents: those who acknowledged a message or submitted a form response in last 30 days
    const [activeAckUsers, activeFormUsers] = await Promise.all([
      prisma.messageAcknowledgment.findMany({
        where: {
          message: { schoolId },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.formResponse.findMany({
        where: {
          form: { schoolId },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ])
    const activeUserIds = new Set([
      ...activeAckUsers.map(a => a.userId),
      ...activeFormUsers.map(f => f.userId),
    ])
    // Also count parents who have a refresh token updated recently (proxy for login)
    const recentTokenUsers = await prisma.refreshToken.findMany({
      where: {
        user: { schoolId, role: 'PARENT' },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { userId: true },
      distinct: ['userId'],
    })
    recentTokenUsers.forEach(t => activeUserIds.add(t.userId))
    const activeParents = activeUserIds.size

    const adoptionRate = totalParents > 0 ? Math.round((activeParents / totalParents) * 1000) / 10 : 0

    // Total students
    const totalStudents = await prisma.student.count({
      where: { schoolId },
    })

    // Messages this month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const totalMessages = await prisma.message.count({
      where: { schoolId, createdAt: { gte: startOfMonth } },
    })

    // Message read rate: average ack count / estimated target count across recent messages
    const recentMessages = await prisma.message.findMany({
      where: { schoolId },
      select: {
        id: true,
        targetClass: true,
        _count: { select: { acknowledgments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })

    let messageReadRate = 0
    if (recentMessages.length > 0 && totalParents > 0) {
      const totalAcks = recentMessages.reduce((sum, m) => sum + m._count.acknowledgments, 0)
      const totalPossible = recentMessages.length * totalParents
      messageReadRate = totalPossible > 0
        ? Math.round((totalAcks / totalPossible) * 1000) / 10
        : 0
    }

    // Forms completion rate
    const activeForms = await prisma.form.findMany({
      where: { schoolId, status: { in: ['ACTIVE', 'CLOSED'] } },
      select: { _count: { select: { responses: true } } },
    })
    const formsWithResponses = activeForms.filter(f => f._count.responses > 0).length
    const formsCompletionRate = activeForms.length > 0
      ? Math.round((formsWithResponses / activeForms.length) * 1000) / 10
      : 0

    // Events RSVP rate
    const rsvpEvents = await prisma.event.findMany({
      where: { schoolId, requiresRsvp: true },
      select: { _count: { select: { rsvps: true } } },
    })
    const eventsWithRsvps = rsvpEvents.filter(e => e._count.rsvps > 0).length
    const eventsRsvpRate = rsvpEvents.length > 0
      ? Math.round((eventsWithRsvps / rsvpEvents.length) * 1000) / 10
      : 0

    // ECA participation rate
    const [eligibleStudents, studentsWithAllocations] = await Promise.all([
      prisma.student.count({ where: { schoolId } }),
      prisma.ecaAllocation.findMany({
        where: {
          ecaTerm: { schoolId },
          status: 'CONFIRMED',
        },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
    ])
    const ecaParticipationRate = eligibleStudents > 0
      ? Math.round((studentsWithAllocations.length / eligibleStudents) * 1000) / 10
      : 0

    // Pulse survey stats
    let pulseAverageRating = 0
    let pulseResponseRate = 0
    const latestPulse = await prisma.pulseSurvey.findFirst({
      where: { schoolId, status: { in: ['OPEN', 'CLOSED'] } },
      orderBy: { closesAt: 'desc' },
      include: { responses: true },
    })
    if (latestPulse && latestPulse.responses.length > 0) {
      // Calculate average of all numeric answers
      let totalRatings = 0
      let ratingCount = 0
      for (const response of latestPulse.responses) {
        const answers = response.answers as Record<string, unknown>
        for (const value of Object.values(answers)) {
          if (typeof value === 'number' && value >= 1 && value <= 5) {
            totalRatings += value
            ratingCount++
          }
        }
      }
      pulseAverageRating = ratingCount > 0
        ? Math.round((totalRatings / ratingCount) * 10) / 10
        : 0
      pulseResponseRate = totalParents > 0
        ? Math.round((latestPulse.responses.length / totalParents) * 1000) / 10
        : 0
    }

    const result = {
      totalParents,
      activeParents,
      adoptionRate,
      totalStudents,
      totalMessages,
      messageReadRate,
      formsCompletionRate,
      eventsRsvpRate,
      ecaParticipationRate,
      pulseAverageRating,
      pulseResponseRate,
    }

    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    console.error('Error fetching analytics overview:', error)
    res.status(500).json({ error: 'Failed to fetch analytics overview' })
  }
})

// GET /api/analytics/messages
router.get('/messages', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const schoolId = user.schoolId
    const cacheKey = `messages:${schoolId}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    // Get parent count for read rate calculation
    const totalParents = await prisma.user.count({
      where: { schoolId, role: 'PARENT' },
    })

    const messages = await prisma.message.findMany({
      where: { schoolId },
      include: {
        _count: { select: { acknowledgments: true } },
        form: {
          include: {
            _count: { select: { responses: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })

    const result = {
      messages: messages.map(msg => {
        // Estimate recipients: for simplicity use total parents as upper bound
        const totalRecipients = totalParents
        const acknowledged = msg._count.acknowledgments
        const readRate = totalRecipients > 0
          ? Math.round((acknowledged / totalRecipients) * 1000) / 10
          : 0

        return {
          id: msg.id,
          title: msg.title,
          sentAt: msg.createdAt.toISOString().split('T')[0],
          targetClass: msg.targetClass,
          totalRecipients,
          acknowledged,
          readRate: Math.min(readRate, 100),
          hasForm: !!msg.formId,
          formResponses: msg.form?._count.responses || 0,
          formCompletionRate: msg.form && totalRecipients > 0
            ? Math.min(Math.round((msg.form._count.responses / totalRecipients) * 1000) / 10, 100)
            : 0,
        }
      }),
    }

    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    console.error('Error fetching message analytics:', error)
    res.status(500).json({ error: 'Failed to fetch message analytics' })
  }
})

// GET /api/analytics/engagement-trend
router.get('/engagement-trend', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const schoolId = user.schoolId
    const cacheKey = `engagement:${schoolId}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    const weeks: Array<{
      week: string
      label: string
      activeUsers: number
      messagesRead: number
      formsCompleted: number
    }> = []

    const now = new Date()

    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay() + 1)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      // ISO week label
      const isoYear = weekStart.getFullYear()
      const jan4 = new Date(isoYear, 0, 4)
      const weekNum = Math.ceil(((weekStart.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7)
      const weekLabel = `${isoYear}-W${String(weekNum).padStart(2, '0')}`
      const dateLabel = `${weekStart.getDate()} ${weekStart.toLocaleString('en-GB', { month: 'short' })}`

      const [ackUsers, formResponses] = await Promise.all([
        prisma.messageAcknowledgment.findMany({
          where: {
            message: { schoolId },
            createdAt: { gte: weekStart, lt: weekEnd },
          },
          select: { userId: true },
          distinct: ['userId'],
        }),
        prisma.formResponse.count({
          where: {
            form: { schoolId },
            createdAt: { gte: weekStart, lt: weekEnd },
          },
        }),
      ])

      const messagesRead = await prisma.messageAcknowledgment.count({
        where: {
          message: { schoolId },
          createdAt: { gte: weekStart, lt: weekEnd },
        },
      })

      weeks.push({
        week: weekLabel,
        label: dateLabel,
        activeUsers: ackUsers.length,
        messagesRead,
        formsCompleted: formResponses,
      })
    }

    const result = { weeks }
    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    console.error('Error fetching engagement trend:', error)
    res.status(500).json({ error: 'Failed to fetch engagement trend' })
  }
})

// GET /api/analytics/eca-stats
router.get('/eca-stats', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const schoolId = user.schoolId
    const cacheKey = `eca:${schoolId}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    // Get the latest active/complete term
    const latestTerm = await prisma.ecaTerm.findFirst({
      where: {
        schoolId,
        status: { in: ['ALLOCATION_COMPLETE', 'ACTIVE', 'COMPLETED'] },
      },
      orderBy: { startDate: 'desc' },
    })

    if (!latestTerm) {
      return res.json({
        totalActivities: 0,
        totalAllocations: 0,
        firstChoiceRate: 0,
        averageActivitiesPerStudent: 0,
        mostPopular: [],
      })
    }

    const termId = latestTerm.id

    const [totalActivities, allocations, selections, activities] = await Promise.all([
      prisma.ecaActivity.count({
        where: { ecaTermId: termId, isActive: true, isCancelled: false },
      }),
      prisma.ecaAllocation.findMany({
        where: { ecaTermId: termId, status: 'CONFIRMED' },
        select: { studentId: true, ecaActivityId: true },
      }),
      prisma.ecaSelection.findMany({
        where: { ecaTermId: termId, rank: 1 },
        select: { studentId: true, ecaActivityId: true },
      }),
      prisma.ecaActivity.findMany({
        where: { ecaTermId: termId, isActive: true, isCancelled: false },
        select: {
          id: true,
          name: true,
          maxCapacity: true,
          _count: { select: { selections: true, allocations: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ])

    const totalAllocations = allocations.length

    // First choice rate: allocations where the student selected the activity as rank 1
    const firstChoiceSet = new Set(
      selections.map(s => `${s.studentId}:${s.ecaActivityId}`)
    )
    const firstChoiceAllocations = allocations.filter(
      a => firstChoiceSet.has(`${a.studentId}:${a.ecaActivityId}`)
    ).length
    const firstChoiceRate = totalAllocations > 0
      ? Math.round((firstChoiceAllocations / totalAllocations) * 1000) / 10
      : 0

    // Average activities per student
    const studentActivityCounts = new Map<string, number>()
    for (const a of allocations) {
      studentActivityCounts.set(a.studentId, (studentActivityCounts.get(a.studentId) || 0) + 1)
    }
    const uniqueStudents = studentActivityCounts.size
    const averageActivitiesPerStudent = uniqueStudents > 0
      ? Math.round((totalAllocations / uniqueStudents) * 10) / 10
      : 0

    // Most popular by demand (selection count)
    const mostPopular = activities
      .map(a => ({
        name: a.name,
        demand: a._count.selections,
        capacity: a.maxCapacity || 0,
      }))
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 5)

    const result = {
      totalActivities,
      totalAllocations,
      firstChoiceRate,
      averageActivitiesPerStudent,
      mostPopular,
    }

    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    console.error('Error fetching ECA stats:', error)
    res.status(500).json({ error: 'Failed to fetch ECA stats' })
  }
})

export default router
