import { Router, Request, Response } from 'express'
import prisma from '../services/prisma.js'
import { isAdmin, isStaff, isAuthenticated, loadUserWithRelations } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { sendNotification } from '../services/notify.js'

const router = Router()

// ============================================
// Admin / Staff Endpoints
// ============================================

// GET /today — Today's attendance overview by class
router.get('/today', isStaff, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    // Get all classes for this school with student counts
    const classes = await prisma.class.findMany({
      where: { schoolId: user.schoolId },
      include: {
        _count: { select: { students: true } },
        yearGroup: true,
      },
      orderBy: { name: 'asc' },
    })

    // Get today's attendance records for this school
    const records = await prisma.attendanceRecord.findMany({
      where: { schoolId: user.schoolId, date: today },
      select: { studentId: true, status: true, student: { select: { classId: true } } },
    })

    // Build a map: classId -> { present, absent, late, excused }
    const classStats: Record<string, { present: number; absent: number; late: number; excused: number; marked: Set<string> }> = {}
    for (const r of records) {
      const cid = r.student.classId
      if (!classStats[cid]) classStats[cid] = { present: 0, absent: 0, late: 0, excused: 0, marked: new Set() }
      classStats[cid].marked.add(r.studentId)
      if (r.status === 'PRESENT') classStats[cid].present++
      else if (r.status === 'ABSENT') classStats[cid].absent++
      else if (r.status === 'LATE') classStats[cid].late++
      else if (r.status === 'EXCUSED') classStats[cid].excused++
    }

    let totalStudents = 0
    let presentToday = 0
    let absentToday = 0
    let lateToday = 0
    let excusedToday = 0

    const classOverviews = classes.map(c => {
      const total = c._count.students
      const stats = classStats[c.id]
      const present = stats?.present ?? 0
      const absent = stats?.absent ?? 0
      const late = stats?.late ?? 0
      const excused = stats?.excused ?? 0
      const unmarked = total - (present + absent + late + excused)

      totalStudents += total
      presentToday += present
      absentToday += absent
      lateToday += late
      excusedToday += excused

      return {
        classId: c.id,
        className: c.name,
        total,
        present,
        absent,
        late,
        unmarked,
      }
    })

    const attendanceRate = totalStudents > 0 ? Math.round((presentToday + lateToday) / totalStudents * 100) : 0

    res.json({
      totalStudents,
      presentToday,
      absentToday,
      lateToday,
      excusedToday,
      attendanceRate,
      classes: classOverviews,
    })
  } catch (error) {
    console.error('Error fetching attendance overview:', error)
    res.status(500).json({ error: 'Failed to fetch attendance overview' })
  }
})

// GET /class/:classId?date=YYYY-MM-DD — Class attendance for a date
router.get('/class/:classId', isStaff, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { classId } = req.params
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10)

    // Verify class belongs to this school
    const classRecord = await prisma.class.findFirst({
      where: { id: classId, schoolId: user.schoolId },
    })
    if (!classRecord) {
      return res.status(404).json({ error: 'Class not found' })
    }

    // Get all students in the class
    const students = await prisma.student.findMany({
      where: { classId, schoolId: user.schoolId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    })

    // Get attendance records for this date
    const records = await prisma.attendanceRecord.findMany({
      where: {
        schoolId: user.schoolId,
        date,
        studentId: { in: students.map(s => s.id) },
      },
    })
    const recordMap = new Map(records.map(r => [r.studentId, r]))

    // Get parent requests covering this date (pending or approved)
    const requests = await prisma.attendanceRequest.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: { in: students.map(s => s.id) },
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: date },
        OR: [
          { endDate: null, startDate: date },
          { endDate: { gte: date } },
        ],
      },
      include: {
        parent: { select: { name: true } },
      },
    })
    const requestMap = new Map<string, typeof requests[number][]>()
    for (const r of requests) {
      const list = requestMap.get(r.studentId) || []
      list.push(r)
      requestMap.set(r.studentId, list)
    }

    const result = students.map(s => {
      const record = recordMap.get(s.id)
      const studentRequests = requestMap.get(s.id) || []
      return {
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        status: record?.status ?? null,
        notes: record?.notes ?? undefined,
        requests: studentRequests.map(r => ({
          id: r.id,
          type: r.type,
          reason: r.reason,
          notes: r.notes,
          time: r.time,
          status: r.status,
          parentName: r.parent.name,
        })),
      }
    })

    res.json({ students: result })
  } catch (error) {
    console.error('Error fetching class attendance:', error)
    res.status(500).json({ error: 'Failed to fetch class attendance' })
  }
})

// POST /mark — Mark/update attendance for multiple students
router.post('/mark', isStaff, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { records, date } = req.body as {
      records: Array<{ studentId: string; status: string; notes?: string }>
      date: string
    }

    if (!records || !Array.isArray(records) || !date) {
      return res.status(400).json({ error: 'records (array) and date are required' })
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' })
    }

    const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']

    // Verify all students belong to this school
    const studentIds = records.map(r => r.studentId)
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId: user.schoolId },
      select: { id: true },
    })
    const validStudentIds = new Set(students.map(s => s.id))

    let marked = 0
    for (const record of records) {
      if (!validStudentIds.has(record.studentId)) continue
      if (!validStatuses.includes(record.status)) continue

      await prisma.attendanceRecord.upsert({
        where: { studentId_date: { studentId: record.studentId, date } },
        create: {
          studentId: record.studentId,
          schoolId: user.schoolId,
          date,
          status: record.status as 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
          notes: record.notes || null,
          markedById: user.id,
        },
        update: {
          status: record.status as 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
          notes: record.notes || null,
          markedById: user.id,
        },
      })
      marked++
    }

    logAudit({
      req,
      action: 'CREATE',
      resourceType: 'ATTENDANCE',
      resourceId: date,
      metadata: { date, recordCount: marked },
    })

    res.json({ marked })
  } catch (error) {
    console.error('Error marking attendance:', error)
    res.status(500).json({ error: 'Failed to mark attendance' })
  }
})

// GET /requests — List attendance requests (admin)
router.get('/requests', isStaff, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { status, type, page = '1', limit = '20' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = Math.min(parseInt(limit as string, 10), 100)
    const skip = (pageNum - 1) * limitNum

    const where: Record<string, unknown> = { schoolId: user.schoolId }
    if (status) where.status = status as string
    if (type) where.type = type as string

    const [requests, total] = await Promise.all([
      prisma.attendanceRequest.findMany({
        where,
        include: {
          student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
          parent: { select: { name: true } },
          reviewedBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.attendanceRequest.count({ where }),
    ])

    res.json({
      requests: requests.map(r => ({
        id: r.id,
        studentId: r.studentId,
        studentName: `${r.student.firstName} ${r.student.lastName}`,
        className: r.student.class.name,
        parentId: r.parentId,
        parentName: r.parent.name,
        type: r.type,
        startDate: r.startDate,
        endDate: r.endDate,
        reason: r.reason,
        notes: r.notes,
        time: r.time,
        status: r.status,
        reviewedBy: r.reviewedBy?.name ?? null,
        reviewNotes: r.reviewNotes,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Error fetching attendance requests:', error)
    res.status(500).json({ error: 'Failed to fetch attendance requests' })
  }
})

// PATCH /requests/:id — Approve/decline an attendance request
router.patch('/requests/:id', isStaff, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { status, reviewNotes } = req.body as { status: 'APPROVED' | 'DECLINED'; reviewNotes?: string }

    if (!status || !['APPROVED', 'DECLINED'].includes(status)) {
      return res.status(400).json({ error: 'status must be APPROVED or DECLINED' })
    }

    const request = await prisma.attendanceRequest.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } }, parent: { select: { name: true } } },
    })
    if (!request) {
      return res.status(404).json({ error: 'Request not found' })
    }

    const updated = await prisma.attendanceRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
      },
      include: {
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
        parent: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
    })

    // If APPROVED absence: auto-create AttendanceRecords with EXCUSED status
    if (status === 'APPROVED' && request.type === 'ABSENCE') {
      const start = new Date(request.startDate)
      const end = request.endDate ? new Date(request.endDate) : start
      const current = new Date(start)

      while (current <= end) {
        const dateStr = current.toISOString().slice(0, 10)
        await prisma.attendanceRecord.upsert({
          where: { studentId_date: { studentId: request.studentId, date: dateStr } },
          create: {
            studentId: request.studentId,
            schoolId: user.schoolId,
            date: dateStr,
            status: 'EXCUSED',
            notes: `Approved absence: ${request.reason}`,
            markedById: user.id,
          },
          update: {
            status: 'EXCUSED',
            notes: `Approved absence: ${request.reason}`,
            markedById: user.id,
          },
        })
        current.setDate(current.getDate() + 1)
      }
    }

    logAudit({
      req,
      action: 'UPDATE',
      resourceType: 'ATTENDANCE_REQUEST',
      resourceId: id,
      metadata: { status, reviewNotes },
    })

    res.json({
      id: updated.id,
      studentId: updated.studentId,
      studentName: `${updated.student.firstName} ${updated.student.lastName}`,
      className: updated.student.class.name,
      parentId: updated.parentId,
      parentName: updated.parent.name,
      type: updated.type,
      startDate: updated.startDate,
      endDate: updated.endDate,
      reason: updated.reason,
      notes: updated.notes,
      time: updated.time,
      status: updated.status,
      reviewedBy: updated.reviewedBy?.name ?? null,
      reviewNotes: updated.reviewNotes,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error reviewing attendance request:', error)
    res.status(500).json({ error: 'Failed to review attendance request' })
  }
})

// GET /analytics — Attendance analytics
router.get('/analytics', isStaff, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const today = new Date().toISOString().slice(0, 10)

    // Calculate date ranges
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay()) // Sunday
    const weekStartStr = weekStart.toISOString().slice(0, 10)

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthStartStr = monthStart.toISOString().slice(0, 10)

    // Total students
    const totalStudents = await prisma.student.count({ where: { schoolId: user.schoolId } })

    // Today's records
    const todayRecords = await prisma.attendanceRecord.findMany({
      where: { schoolId: user.schoolId, date: today },
    })
    const todayPresent = todayRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length
    const todayRate = totalStudents > 0 ? Math.round(todayPresent / totalStudents * 100) : 0

    // Week records
    const weekRecords = await prisma.attendanceRecord.findMany({
      where: { schoolId: user.schoolId, date: { gte: weekStartStr, lte: today } },
    })
    const weekPresent = weekRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length
    const weekRate = weekRecords.length > 0 ? Math.round(weekPresent / weekRecords.length * 100) : 0

    // Month records
    const monthRecords = await prisma.attendanceRecord.findMany({
      where: { schoolId: user.schoolId, date: { gte: monthStartStr, lte: today } },
    })
    const monthPresent = monthRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length
    const monthRate = monthRecords.length > 0 ? Math.round(monthPresent / monthRecords.length * 100) : 0

    // Most absent students (top 10)
    const absentCounts = await prisma.attendanceRecord.groupBy({
      by: ['studentId'],
      where: { schoolId: user.schoolId, status: 'ABSENT' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    const absentStudentIds = absentCounts.map(a => a.studentId)
    const absentStudents = await prisma.student.findMany({
      where: { id: { in: absentStudentIds } },
      include: { class: { select: { name: true } } },
    })
    const studentMap = new Map(absentStudents.map(s => [s.id, s]))

    const mostAbsent = absentCounts.map(a => {
      const s = studentMap.get(a.studentId)
      return {
        studentName: s ? `${s.firstName} ${s.lastName}` : 'Unknown',
        className: s?.class.name ?? 'Unknown',
        absences: a._count.id,
      }
    })

    // Absence by reason
    const requests = await prisma.attendanceRequest.findMany({
      where: { schoolId: user.schoolId, type: 'ABSENCE' },
      select: { reason: true },
    })
    const byReason: Record<string, number> = {}
    for (const r of requests) {
      byReason[r.reason] = (byReason[r.reason] || 0) + 1
    }

    res.json({
      todayRate,
      weekRate,
      monthRate,
      totalRecords: todayRecords.length,
      byReason,
      mostAbsent,
    })
  } catch (error) {
    console.error('Error fetching attendance analytics:', error)
    res.status(500).json({ error: 'Failed to fetch attendance analytics' })
  }
})

// GET /export?startDate=&endDate= — CSV export
router.get('/export', isStaff, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    const { startDate, endDate } = req.query as { startDate: string; endDate: string }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' })
    }

    const records = await prisma.attendanceRecord.findMany({
      where: {
        schoolId: user.schoolId,
        date: { gte: startDate, lte: endDate },
      },
      include: {
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
        markedBy: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { student: { lastName: 'asc' } }],
    })

    // Build CSV
    const header = 'Date,Student Name,Class,Status,Notes,Marked By'
    const rows = records.map(r => {
      const name = `${r.student.firstName} ${r.student.lastName}`
      const notes = (r.notes || '').replace(/"/g, '""')
      const markedBy = r.markedBy?.name || ''
      return `${r.date},"${name}","${r.student.class.name}",${r.status},"${notes}","${markedBy}"`
    })

    const csv = [header, ...rows].join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${startDate}_to_${endDate}.csv"`)
    res.send(csv)
  } catch (error) {
    console.error('Error exporting attendance:', error)
    res.status(500).json({ error: 'Failed to export attendance' })
  }
})

// ============================================
// Parent Endpoints
// ============================================

// POST /request — Submit absence/early pickup/late arrival request
router.post('/request', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Only parents can submit attendance requests' })
    }

    const { studentId, type, startDate, endDate, reason, notes, time } = req.body as {
      studentId: string
      type: string
      startDate: string
      endDate?: string
      reason: string
      notes?: string
      time?: string
    }

    if (!studentId || !type || !startDate || !reason) {
      return res.status(400).json({ error: 'studentId, type, startDate, and reason are required' })
    }

    const validTypes = ['ABSENCE', 'EARLY_PICKUP', 'LATE_ARRIVAL']
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use ABSENCE, EARLY_PICKUP, or LATE_ARRIVAL' })
    }

    // Verify student belongs to parent via ParentStudentLink
    const link = await prisma.parentStudentLink.findFirst({
      where: { userId: user.id, studentId },
      include: { student: { include: { class: true } } },
    })
    if (!link) {
      return res.status(403).json({ error: 'Student does not belong to this parent' })
    }

    const request = await prisma.attendanceRequest.create({
      data: {
        studentId,
        parentId: user.id,
        schoolId: user.schoolId,
        type: type as 'ABSENCE' | 'EARLY_PICKUP' | 'LATE_ARRIVAL',
        startDate,
        endDate: endDate || null,
        reason,
        notes: notes || null,
        time: time || null,
        status: 'PENDING',
      },
      include: {
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
        parent: { select: { name: true } },
      },
    })

    // Notify school admins
    sendNotification({
      req,
      type: 'ATTENDANCE_REQUEST',
      title: 'New Attendance Request',
      body: `${user.name} submitted a ${type.toLowerCase().replace('_', ' ')} request for ${link.student.firstName} ${link.student.lastName}`,
      resourceType: 'ATTENDANCE_REQUEST',
      resourceId: request.id,
      target: {
        targetClass: 'Whole School',
        schoolId: user.schoolId,
      },
    })

    res.json({
      id: request.id,
      studentId: request.studentId,
      studentName: `${request.student.firstName} ${request.student.lastName}`,
      className: request.student.class.name,
      parentId: request.parentId,
      parentName: request.parent.name,
      type: request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      reason: request.reason,
      notes: request.notes,
      time: request.time,
      status: request.status,
      reviewedBy: null,
      reviewNotes: null,
      reviewedAt: null,
      createdAt: request.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('Error submitting attendance request:', error)
    res.status(500).json({ error: 'Failed to submit attendance request' })
  }
})

// GET /my-requests — List parent's own requests
router.get('/my-requests', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Only parents can view their requests' })
    }

    const requests = await prisma.attendanceRequest.findMany({
      where: { parentId: user.id },
      include: {
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
        parent: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(requests.map(r => ({
      id: r.id,
      studentId: r.studentId,
      studentName: `${r.student.firstName} ${r.student.lastName}`,
      className: r.student.class.name,
      parentId: r.parentId,
      parentName: r.parent.name,
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason,
      notes: r.notes,
      time: r.time,
      status: r.status,
      reviewedBy: r.reviewedBy?.name ?? null,
      reviewNotes: r.reviewNotes,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching parent requests:', error)
    res.status(500).json({ error: 'Failed to fetch requests' })
  }
})

// GET /my-children — Attendance summary for parent's children
router.get('/my-children', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user!
    if (user.role !== 'PARENT') {
      return res.status(403).json({ error: 'Only parents can view their children attendance' })
    }

    // Get parent's children via ParentStudentLink
    const links = await prisma.parentStudentLink.findMany({
      where: { userId: user.id },
      include: {
        student: {
          include: { class: { select: { name: true } } },
        },
      },
    })

    // Two weeks ago
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().slice(0, 10)

    const summaries = await Promise.all(links.map(async link => {
      const student = link.student

      // All-time counts
      const records = await prisma.attendanceRecord.findMany({
        where: { studentId: student.id },
      })

      const present = records.filter(r => r.status === 'PRESENT').length
      const absent = records.filter(r => r.status === 'ABSENT').length
      const late = records.filter(r => r.status === 'LATE').length
      const excused = records.filter(r => r.status === 'EXCUSED').length

      // Recent records (last 2 weeks)
      const recentRecords = await prisma.attendanceRecord.findMany({
        where: { studentId: student.id, date: { gte: twoWeeksAgoStr } },
        orderBy: { date: 'desc' },
      })

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        className: student.class.name,
        present,
        absent,
        late,
        excused,
        recentRecords: recentRecords.map(r => ({
          id: r.id,
          studentId: r.studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          className: student.class.name,
          date: r.date,
          status: r.status,
          notes: r.notes,
          markedBy: null,
          createdAt: r.createdAt.toISOString(),
        })),
      }
    }))

    res.json(summaries)
  } catch (error) {
    console.error('Error fetching children attendance:', error)
    res.status(500).json({ error: 'Failed to fetch children attendance' })
  }
})

export default router
