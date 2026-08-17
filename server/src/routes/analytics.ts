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

// Rate as a 0–100 percentage, rounded to one decimal and capped at 100.
// Mirrors the read-rate math already used in /overview: a rate can never
// legitimately exceed 100% (one parent = one ack/RSVP/response per item), so we
// cap rather than emit >100 when denominators are estimates. Zero denominator
// (brand-new pilot, no data) returns 0 — never NaN/Infinity.
function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.min(Math.round((numerator / denominator) * 1000) / 10, 100)
}

// Shared activation model for the funnel, by-class table, and not-activated
// list. A parent counts as "activated" if we have ever seen them authenticate:
// lastSeenAt is set (the precise signal), OR — as a fallback for parents who
// authenticated before lastSeenAt shipped — they hold a RefreshToken or their
// email has a consumed LoginCode. All queries here are PARENT-only and scoped
// to the caller's school. Returns the parent roster plus the set of activated
// parent ids so callers can slice it however they need.
async function loadParentActivation(schoolId: string): Promise<{
  parents: Array<{
    id: string
    email: string
    name: string
    lastSeenAt: Date | null
    welcomeSentAt: Date | null
  }>
  activatedIds: Set<string>
}> {
  const parents = await prisma.user.findMany({
    where: { schoolId, role: 'PARENT' },
    select: { id: true, email: true, name: true, lastSeenAt: true, welcomeSentAt: true },
  })
  const parentIds = parents.map(p => p.id)
  const emails = parents.map(p => p.email)

  const [tokenUsers, consumedCodes] = await Promise.all([
    prisma.refreshToken.findMany({
      where: { userId: { in: parentIds } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.loginCode.findMany({
      where: { consumedAt: { not: null }, email: { in: emails } },
      select: { email: true },
      distinct: ['email'],
    }),
  ])
  const tokenSet = new Set(tokenUsers.map(t => t.userId))
  const consumedEmailSet = new Set(consumedCodes.map(c => c.email))

  const activatedIds = new Set<string>()
  for (const p of parents) {
    if (p.lastSeenAt != null || tokenSet.has(p.id) || consumedEmailSet.has(p.email)) {
      activatedIds.add(p.id)
    }
  }
  return { parents, activatedIds }
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

    // Message read rate: only count acknowledgments from PARENT users, since the
    // denominator (totalParents) only counts parents. Staff/admins acking their
    // own messages would otherwise push this above 100%.
    const recentMessages = await prisma.message.findMany({
      where: { schoolId },
      select: {
        id: true,
        targetClass: true,
        _count: {
          select: {
            acknowledgments: { where: { user: { role: 'PARENT' } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })

    let messageReadRate = 0
    if (recentMessages.length > 0 && totalParents > 0) {
      const totalAcks = recentMessages.reduce((sum, m) => sum + m._count.acknowledgments, 0)
      const totalPossible = recentMessages.length * totalParents
      messageReadRate = totalPossible > 0
        ? Math.min(Math.round((totalAcks / totalPossible) * 1000) / 10, 100)
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
        _count: {
          select: {
            acknowledgments: { where: { user: { role: 'PARENT' } } },
          },
        },
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

// GET /api/analytics/launch — the pilot-decision scorecard: onboarding funnel,
// activation rate, push adoption, and headline usage counts in one payload.
router.get('/launch', isAdmin, async (req, res) => {
  try {
    const schoolId = req.user!.schoolId
    const cacheKey = `launch:${schoolId}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    const { parents, activatedIds } = await loadParentActivation(schoolId)
    const totalParents = parents.length
    const parentIds = parents.map(p => p.id)

    const now = Date.now()
    const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000)
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000)

    const invited = parents.filter(p => p.welcomeSentAt != null).length
    const activated = activatedIds.size
    const active7 = parents.filter(p => p.lastSeenAt != null && p.lastSeenAt >= d7).length
    const active30 = parents.filter(p => p.lastSeenAt != null && p.lastSeenAt >= d30).length

    const [
      pushUsers,
      messagesSent,
      inboxThreads,
      rsvps,
      formsSent,
      attendanceRequests,
      pulseResponses,
    ] = await Promise.all([
      prisma.deviceToken.findMany({
        where: { userId: { in: parentIds } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.message.count({ where: { schoolId } }),
      prisma.conversation.count({ where: { schoolId } }),
      prisma.eventRsvp.count({ where: { event: { schoolId } } }),
      prisma.form.count({ where: { schoolId, status: { in: ['ACTIVE', 'CLOSED'] } } }),
      prisma.attendanceRequest.count({ where: { schoolId } }),
      prisma.pulseResponse.count({ where: { pulse: { schoolId } } }),
    ])
    const pushCount = pushUsers.length

    const result = {
      funnel: { totalParents, invited, activated, active7, active30 },
      activationRate: pct(activated, totalParents),
      pushAdoption: { count: pushCount, pct: pct(pushCount, totalParents) },
      usage: {
        messagesSent,
        inboxThreads,
        rsvps,
        formsSent,
        attendanceRequests,
        pulseResponses,
      },
    }

    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    console.error('Error fetching launch analytics:', error)
    res.status(500).json({ error: 'Failed to fetch launch analytics' })
  }
})

// GET /api/analytics/active-trend?days=30 — daily distinct active parents plus
// rolled-up WAU/MAU. Unlike lastSeenAt (which only holds the *latest* touch),
// the historical series is reconstructed from per-event timestamps so each day
// reflects who was actually active then. A parent counts as active on a day if
// they did ANY tracked action that day: a login/refresh (RefreshToken), a
// consumed LoginCode, a post ack, an RSVP, a form response, an inbox message, or
// an attendance request. Deduped by parent id per day/window.
router.get('/active-trend', isAdmin, async (req, res) => {
  try {
    const schoolId = req.user!.schoolId
    const daysRaw = parseInt(String(req.query.days ?? ''), 10)
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30
    const cacheKey = `active-trend:${schoolId}:${days}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    const now = new Date()
    // Bucket boundary helper — UTC day key so buckets are deterministic.
    const dayKey = (d: Date) => d.toISOString().slice(0, 10)
    // Fetch at least 30 days so WAU/MAU are correct even when days < 30.
    const spanDays = Math.max(days, 30)
    const startDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    startDay.setUTCDate(startDay.getUTCDate() - (spanDays - 1))

    // Map parent email -> id (for LoginCode, which is keyed by email) and the
    // set of parent ids used to scope inbox/attendance/token queries.
    const parents = await prisma.user.findMany({
      where: { schoolId, role: 'PARENT' },
      select: { id: true, email: true },
    })
    const parentIds = parents.map(p => p.id)
    const emailToId = new Map(parents.map(p => [p.email, p.id]))

    // Collect { userId, at } events across every tracked source in the window.
    const events: Array<{ userId: string; at: Date }> = []

    const [
      tokens,
      codes,
      acks,
      rsvps,
      formResponses,
      inboxMessages,
      attendance,
    ] = await Promise.all([
      prisma.refreshToken.findMany({
        where: { userId: { in: parentIds }, createdAt: { gte: startDay } },
        select: { userId: true, createdAt: true },
      }),
      prisma.loginCode.findMany({
        where: { consumedAt: { gte: startDay }, email: { in: parents.map(p => p.email) } },
        select: { email: true, consumedAt: true },
      }),
      prisma.messageAcknowledgment.findMany({
        where: { message: { schoolId }, user: { role: 'PARENT' }, createdAt: { gte: startDay } },
        select: { userId: true, createdAt: true },
      }),
      prisma.eventRsvp.findMany({
        where: { event: { schoolId }, user: { role: 'PARENT' }, createdAt: { gte: startDay } },
        select: { userId: true, createdAt: true },
      }),
      prisma.formResponse.findMany({
        where: { form: { schoolId }, user: { role: 'PARENT' }, createdAt: { gte: startDay } },
        select: { userId: true, createdAt: true },
      }),
      prisma.conversationMessage.findMany({
        where: {
          conversation: { schoolId },
          sender: { role: 'PARENT' },
          createdAt: { gte: startDay },
        },
        select: { senderId: true, createdAt: true },
      }),
      prisma.attendanceRequest.findMany({
        where: { schoolId, parentId: { in: parentIds }, createdAt: { gte: startDay } },
        select: { parentId: true, createdAt: true },
      }),
    ])

    for (const t of tokens) events.push({ userId: t.userId, at: t.createdAt })
    for (const c of codes) {
      const id = emailToId.get(c.email)
      if (id && c.consumedAt) events.push({ userId: id, at: c.consumedAt })
    }
    for (const a of acks) events.push({ userId: a.userId, at: a.createdAt })
    for (const r of rsvps) events.push({ userId: r.userId, at: r.createdAt })
    for (const f of formResponses) events.push({ userId: f.userId, at: f.createdAt })
    for (const m of inboxMessages) events.push({ userId: m.senderId, at: m.createdAt })
    for (const at of attendance) events.push({ userId: at.parentId, at: at.createdAt })

    // Per-day dedup.
    const byDay = new Map<string, Set<string>>()
    const wauCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const mauCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const wau = new Set<string>()
    const mau = new Set<string>()
    for (const e of events) {
      const key = dayKey(e.at)
      let set = byDay.get(key)
      if (!set) byDay.set(key, (set = new Set()))
      set.add(e.userId)
      if (e.at >= wauCutoff) wau.add(e.userId)
      if (e.at >= mauCutoff) mau.add(e.userId)
    }

    // Emit exactly `days` points (oldest first), including empty days as 0.
    const points: Array<{ date: string; activeUsers: number }> = []
    const firstPoint = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    firstPoint.setUTCDate(firstPoint.getUTCDate() - (days - 1))
    for (let i = 0; i < days; i++) {
      const d = new Date(firstPoint)
      d.setUTCDate(d.getUTCDate() + i)
      const key = dayKey(d)
      points.push({ date: key, activeUsers: byDay.get(key)?.size ?? 0 })
    }

    const result = { points, wau: wau.size, mau: mau.size }
    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    console.error('Error fetching active trend:', error)
    res.status(500).json({ error: 'Failed to fetch active trend' })
  }
})

// GET /api/analytics/feature-usage — per-feature engagement. All rates are
// PARENT-only in the numerator and capped at 100% (see pct()).
router.get('/feature-usage', isAdmin, async (req, res) => {
  try {
    const schoolId = req.user!.schoolId
    const cacheKey = `feature-usage:${schoolId}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    const totalParents = await prisma.user.count({ where: { schoolId, role: 'PARENT' } })
    const staffRoles: Array<'STAFF' | 'ADMIN' | 'SUPER_ADMIN'> = ['STAFF', 'ADMIN', 'SUPER_ADMIN']

    const [
      threads,
      parentMessages,
      threadsWithStaffReply,
      postsSent,
      parentAcks,
      eventsCount,
      rsvpEventCount,
      rsvps,
      formsSent,
      formResponses,
      attendanceParentRequests,
      pulseSent,
      pulseResponseRows,
    ] = await Promise.all([
      prisma.conversation.count({ where: { schoolId } }),
      prisma.conversationMessage.count({
        where: { conversation: { schoolId }, sender: { role: 'PARENT' } },
      }),
      prisma.conversation.count({
        where: { schoolId, messages: { some: { sender: { role: { in: staffRoles } } } } },
      }),
      prisma.message.count({ where: { schoolId } }),
      prisma.messageAcknowledgment.count({
        where: { message: { schoolId }, user: { role: 'PARENT' } },
      }),
      prisma.event.count({ where: { schoolId } }),
      prisma.event.count({ where: { schoolId, requiresRsvp: true } }),
      prisma.eventRsvp.count({ where: { event: { schoolId }, user: { role: 'PARENT' } } }),
      prisma.form.count({ where: { schoolId, status: { in: ['ACTIVE', 'CLOSED'] } } }),
      prisma.formResponse.count({
        where: { form: { schoolId, status: { in: ['ACTIVE', 'CLOSED'] } }, user: { role: 'PARENT' } },
      }),
      prisma.attendanceRequest.count({ where: { schoolId } }),
      prisma.pulseSurvey.count({ where: { schoolId, status: { in: ['OPEN', 'CLOSED'] } } }),
      prisma.pulseResponse.findMany({
        where: { pulse: { schoolId, status: { in: ['OPEN', 'CLOSED'] } } },
        select: { answers: true },
      }),
    ])

    // Pulse average score: mean of all 1–5 numeric answers across responses.
    let totalRatings = 0
    let ratingCount = 0
    for (const r of pulseResponseRows) {
      const answers = r.answers as Record<string, unknown>
      for (const v of Object.values(answers)) {
        if (typeof v === 'number' && v >= 1 && v <= 5) {
          totalRatings += v
          ratingCount++
        }
      }
    }
    const avgScore = ratingCount > 0 ? Math.round((totalRatings / ratingCount) * 10) / 10 : 0

    const result = {
      inbox: {
        threads,
        parentMessages,
        threadsWithStaffReply,
        replyRate: pct(threadsWithStaffReply, threads),
      },
      posts: {
        sent: postsSent,
        readRate: pct(parentAcks, postsSent * totalParents),
      },
      events: {
        count: eventsCount,
        rsvps,
        rsvpRate: pct(rsvps, rsvpEventCount * totalParents),
      },
      forms: {
        sent: formsSent,
        completionRate: pct(formResponses, formsSent * totalParents),
      },
      attendance: {
        parentRequests: attendanceParentRequests,
      },
      pulse: {
        sent: pulseSent,
        responseRate: pct(pulseResponseRows.length, pulseSent * totalParents),
        avgScore,
      },
    }

    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    console.error('Error fetching feature usage:', error)
    res.status(500).json({ error: 'Failed to fetch feature usage' })
  }
})

// GET /api/analytics/by-class — engagement league table. A class's parents are
// the distinct parents linked (ParentStudentLink -> Student -> Class) to a pupil
// in that class; a parent with children in multiple classes counts in each.
// Sorted by activePct descending.
router.get('/by-class', isAdmin, async (req, res) => {
  try {
    const schoolId = req.user!.schoolId
    const cacheKey = `by-class:${schoolId}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    const { activatedIds } = await loadParentActivation(schoolId)

    const links = await prisma.parentStudentLink.findMany({
      where: { user: { schoolId, role: 'PARENT' }, student: { schoolId } },
      select: {
        userId: true,
        student: { select: { class: { select: { id: true, name: true } } } },
      },
    })

    // classId -> { name, parentIds }
    const byClass = new Map<string, { name: string; parentIds: Set<string> }>()
    for (const l of links) {
      const cls = l.student.class
      let entry = byClass.get(cls.id)
      if (!entry) byClass.set(cls.id, (entry = { name: cls.name, parentIds: new Set() }))
      entry.parentIds.add(l.userId)
    }

    const classes = Array.from(byClass.entries())
      .map(([id, { name, parentIds }]) => {
        const totalParents = parentIds.size
        let activatedParents = 0
        for (const pid of parentIds) if (activatedIds.has(pid)) activatedParents++
        return { id, name, totalParents, activatedParents, activePct: pct(activatedParents, totalParents) }
      })
      .sort((a, b) => b.activePct - a.activePct || a.name.localeCompare(b.name))

    const result = { classes }
    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    console.error('Error fetching by-class analytics:', error)
    res.status(500).json({ error: 'Failed to fetch by-class analytics' })
  }
})

// GET /api/analytics/not-activated — the actionable chase list: parents with no
// activation at all (lastSeenAt null AND no login history), with the class of
// their first linked child so the school knows who to contact. Pilot-sized, so
// we return every match (no pagination).
router.get('/not-activated', isAdmin, async (req, res) => {
  try {
    const schoolId = req.user!.schoolId
    const cacheKey = `not-activated:${schoolId}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    const { parents, activatedIds } = await loadParentActivation(schoolId)
    const notActivated = parents.filter(p => !activatedIds.has(p.id))
    const notActivatedIds = notActivated.map(p => p.id)

    // First linked child's class name per parent (earliest link wins).
    const links = await prisma.parentStudentLink.findMany({
      where: { userId: { in: notActivatedIds } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, student: { select: { class: { select: { name: true } } } } },
    })
    const classByUser = new Map<string, string>()
    for (const l of links) {
      if (!classByUser.has(l.userId)) classByUser.set(l.userId, l.student.class.name)
    }

    const result = {
      parents: notActivated.map(p => ({
        userId: p.id,
        name: p.name,
        email: p.email,
        className: classByUser.get(p.id) ?? null,
      })),
    }

    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    console.error('Error fetching not-activated parents:', error)
    res.status(500).json({ error: 'Failed to fetch not-activated parents' })
  }
})

export default router
