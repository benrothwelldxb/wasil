import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'
import { logAudit } from '../services/audit.js'
import { runAllocation, previewAllocation } from '../services/ecaAllocation.js'
import { generateAttendanceRegisterHtml, generateBlankRegisterHtml } from '../services/ecaPdf.js'

const router = Router()

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Get school ECA settings
router.get('/settings', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    let settings = await prisma.ecaSettings.findUnique({
      where: { schoolId: user.schoolId },
    })

    // Create default settings if not exist
    if (!settings) {
      settings = await prisma.ecaSettings.create({
        data: {
          schoolId: user.schoolId,
          selectionMode: 'FIRST_COME_FIRST_SERVED',
          attendanceEnabled: false,
          maxPriorityChoices: 1,
          maxChoicesPerDay: 3,
        },
      })
    }

    res.json(settings)
  } catch (error) {
    console.error('Error fetching ECA settings:', error)
    res.status(500).json({ error: 'Failed to fetch ECA settings' })
  }
})

// Update ECA settings
router.put('/settings', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { selectionMode, attendanceEnabled, maxPriorityChoices, maxChoicesPerDay } = req.body

    const settings = await prisma.ecaSettings.upsert({
      where: { schoolId: user.schoolId },
      update: {
        selectionMode,
        attendanceEnabled,
        maxPriorityChoices,
        maxChoicesPerDay,
      },
      create: {
        schoolId: user.schoolId,
        selectionMode: selectionMode || 'FIRST_COME_FIRST_SERVED',
        attendanceEnabled: attendanceEnabled || false,
        maxPriorityChoices: maxPriorityChoices || 1,
        maxChoicesPerDay: maxChoicesPerDay || 3,
      },
    })

    res.json(settings)
  } catch (error) {
    console.error('Error updating ECA settings:', error)
    res.status(500).json({ error: 'Failed to update ECA settings' })
  }
})

// List all terms
router.get('/terms', isAdmin, async (req, res) => {
  try {
    const user = req.user!

    const terms = await prisma.ecaTerm.findMany({
      where: { schoolId: user.schoolId },
      include: {
        _count: {
          select: {
            activities: true,
            selections: true,
            allocations: true,
          },
        },
      },
      orderBy: [{ academicYear: 'desc' }, { termNumber: 'desc' }],
    })

    res.json(terms.map(t => ({
      ...t,
      activityCount: t._count.activities,
      selectionCount: t._count.selections,
      allocationCount: t._count.allocations,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      registrationOpens: t.registrationOpens.toISOString(),
      registrationCloses: t.registrationCloses.toISOString(),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching ECA terms:', error)
    res.status(500).json({ error: 'Failed to fetch ECA terms' })
  }
})

// Create term
router.post('/terms', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const {
      name,
      termNumber,
      academicYear,
      startDate,
      endDate,
      registrationOpens,
      registrationCloses,
      defaultBeforeSchoolStart,
      defaultBeforeSchoolEnd,
      defaultAfterSchoolStart,
      defaultAfterSchoolEnd,
    } = req.body

    const term = await prisma.ecaTerm.create({
      data: {
        schoolId: user.schoolId,
        name,
        termNumber,
        academicYear,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        registrationOpens: new Date(registrationOpens),
        registrationCloses: new Date(registrationCloses),
        defaultBeforeSchoolStart,
        defaultBeforeSchoolEnd,
        defaultAfterSchoolStart,
        defaultAfterSchoolEnd,
        status: 'DRAFT',
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'ECA_TERM', resourceId: term.id, metadata: { name: term.name } })

    res.status(201).json({
      ...term,
      startDate: term.startDate.toISOString(),
      endDate: term.endDate.toISOString(),
      registrationOpens: term.registrationOpens.toISOString(),
      registrationCloses: term.registrationCloses.toISOString(),
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A term with this number and academic year already exists' })
    }
    console.error('Error creating ECA term:', error)
    res.status(500).json({ error: 'Failed to create ECA term' })
  }
})

// Get term with activities
router.get('/terms/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const term = await prisma.ecaTerm.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        activities: {
          include: {
            category: { select: { id: true, name: true, icon: true, color: true } },
            staff: { select: { id: true, name: true } },
            _count: {
              select: {
                allocations: { where: { status: 'CONFIRMED' } },
                waitlists: true,
                selections: true,
              },
            },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: 'asc' }, { name: 'asc' }],
        },
      },
    })

    if (!term) {
      return res.status(404).json({ error: 'Term not found' })
    }

    res.json({
      ...term,
      startDate: term.startDate.toISOString(),
      endDate: term.endDate.toISOString(),
      registrationOpens: term.registrationOpens.toISOString(),
      registrationCloses: term.registrationCloses.toISOString(),
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
      activities: term.activities.map(a => ({
        ...a,
        eligibleYearGroupIds: JSON.parse(a.eligibleYearGroupIds as string),
        currentEnrollment: a._count.allocations,
        waitlistCount: a._count.waitlists,
        selectionCount: a._count.selections,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching ECA term:', error)
    res.status(500).json({ error: 'Failed to fetch ECA term' })
  }
})

// Update term
router.put('/terms/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const {
      name,
      startDate,
      endDate,
      registrationOpens,
      registrationCloses,
      defaultBeforeSchoolStart,
      defaultBeforeSchoolEnd,
      defaultAfterSchoolStart,
      defaultAfterSchoolEnd,
    } = req.body

    const existing = await prisma.ecaTerm.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Term not found' })
    }

    const term = await prisma.ecaTerm.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        startDate: startDate ? new Date(startDate) : existing.startDate,
        endDate: endDate ? new Date(endDate) : existing.endDate,
        registrationOpens: registrationOpens ? new Date(registrationOpens) : existing.registrationOpens,
        registrationCloses: registrationCloses ? new Date(registrationCloses) : existing.registrationCloses,
        defaultBeforeSchoolStart: defaultBeforeSchoolStart ?? existing.defaultBeforeSchoolStart,
        defaultBeforeSchoolEnd: defaultBeforeSchoolEnd ?? existing.defaultBeforeSchoolEnd,
        defaultAfterSchoolStart: defaultAfterSchoolStart ?? existing.defaultAfterSchoolStart,
        defaultAfterSchoolEnd: defaultAfterSchoolEnd ?? existing.defaultAfterSchoolEnd,
      },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'ECA_TERM', resourceId: term.id, metadata: { name: term.name } })

    res.json({
      ...term,
      startDate: term.startDate.toISOString(),
      endDate: term.endDate.toISOString(),
      registrationOpens: term.registrationOpens.toISOString(),
      registrationCloses: term.registrationCloses.toISOString(),
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating ECA term:', error)
    res.status(500).json({ error: 'Failed to update ECA term' })
  }
})

// Delete term (DRAFT only)
router.delete('/terms/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const term = await prisma.ecaTerm.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!term) {
      return res.status(404).json({ error: 'Term not found' })
    }

    if (term.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only draft terms can be deleted' })
    }

    await prisma.ecaTerm.delete({ where: { id } })

    logAudit({ req, action: 'DELETE', resourceType: 'ECA_TERM', resourceId: id, metadata: { name: term.name } })

    res.json({ message: 'Term deleted successfully' })
  } catch (error) {
    console.error('Error deleting ECA term:', error)
    res.status(500).json({ error: 'Failed to delete ECA term' })
  }
})

// Update term status
router.patch('/terms/:id/status', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { status } = req.body

    const term = await prisma.ecaTerm.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!term) {
      return res.status(404).json({ error: 'Term not found' })
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['REGISTRATION_OPEN'],
      REGISTRATION_OPEN: ['REGISTRATION_CLOSED'],
      REGISTRATION_CLOSED: ['ALLOCATION_COMPLETE'],
      ALLOCATION_COMPLETE: ['ACTIVE'],
      ACTIVE: ['COMPLETED'],
      COMPLETED: [],
    }

    if (!validTransitions[term.status]?.includes(status)) {
      return res.status(400).json({ error: `Cannot transition from ${term.status} to ${status}` })
    }

    const updated = await prisma.ecaTerm.update({
      where: { id },
      data: { status },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'ECA_TERM', resourceId: id, metadata: { name: term.name, status } })

    res.json({
      ...updated,
      startDate: updated.startDate.toISOString(),
      endDate: updated.endDate.toISOString(),
      registrationOpens: updated.registrationOpens.toISOString(),
      registrationCloses: updated.registrationCloses.toISOString(),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating term status:', error)
    res.status(500).json({ error: 'Failed to update term status' })
  }
})

// Create activity
router.post('/terms/:id/activities', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id: ecaTermId } = req.params
    const {
      name,
      description,
      categoryId,
      dayOfWeek,
      timeSlot,
      customStartTime,
      customEndTime,
      location,
      activityType,
      eligibleYearGroupIds,
      eligibleGender,
      minCapacity,
      maxCapacity,
      staffId,
    } = req.body

    // Verify term exists
    const term = await prisma.ecaTerm.findFirst({
      where: { id: ecaTermId, schoolId: user.schoolId },
    })

    if (!term) {
      return res.status(404).json({ error: 'Term not found' })
    }

    // Auto-create group for this activity
    const group = await prisma.group.create({
      data: {
        name: `${name} (${term.name})`,
        schoolId: user.schoolId,
        categoryId: categoryId || null,
        isActive: true,
      },
    })

    // Assign staff to group if provided
    if (staffId) {
      await prisma.staffGroupAssignment.create({
        data: {
          userId: staffId,
          groupId: group.id,
          canMessage: true,
          canManage: true,
        },
      })
    }

    const activity = await prisma.ecaActivity.create({
      data: {
        ecaTermId,
        schoolId: user.schoolId,
        name,
        description: description || null,
        groupId: group.id,
        categoryId: categoryId || null,
        dayOfWeek,
        timeSlot,
        customStartTime: customStartTime || null,
        customEndTime: customEndTime || null,
        location: location || null,
        activityType: activityType || 'OPEN',
        eligibleYearGroupIds: JSON.stringify(eligibleYearGroupIds || []),
        eligibleGender: eligibleGender || 'MIXED',
        minCapacity: minCapacity || null,
        maxCapacity: maxCapacity || null,
        staffId: staffId || null,
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        staff: { select: { id: true, name: true } },
      },
    })

    logAudit({ req, action: 'CREATE', resourceType: 'ECA_ACTIVITY', resourceId: activity.id, metadata: { name: activity.name } })

    res.status(201).json({
      ...activity,
      eligibleYearGroupIds: JSON.parse(activity.eligibleYearGroupIds as string),
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating ECA activity:', error)
    res.status(500).json({ error: 'Failed to create ECA activity' })
  }
})

// Update activity
router.put('/activities/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const {
      name,
      description,
      categoryId,
      dayOfWeek,
      timeSlot,
      customStartTime,
      customEndTime,
      location,
      activityType,
      eligibleYearGroupIds,
      eligibleGender,
      minCapacity,
      maxCapacity,
      staffId,
      isActive,
    } = req.body

    const existing = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const activity = await prisma.ecaActivity.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        description: description !== undefined ? (description || null) : existing.description,
        categoryId: categoryId !== undefined ? (categoryId || null) : existing.categoryId,
        dayOfWeek: dayOfWeek ?? existing.dayOfWeek,
        timeSlot: timeSlot ?? existing.timeSlot,
        customStartTime: customStartTime !== undefined ? (customStartTime || null) : existing.customStartTime,
        customEndTime: customEndTime !== undefined ? (customEndTime || null) : existing.customEndTime,
        location: location !== undefined ? (location || null) : existing.location,
        activityType: activityType ?? existing.activityType,
        eligibleYearGroupIds: eligibleYearGroupIds ? JSON.stringify(eligibleYearGroupIds) : undefined,
        eligibleGender: eligibleGender ?? existing.eligibleGender,
        minCapacity: minCapacity !== undefined ? minCapacity : existing.minCapacity,
        maxCapacity: maxCapacity !== undefined ? maxCapacity : existing.maxCapacity,
        staffId: staffId !== undefined ? (staffId || null) : existing.staffId,
        isActive: isActive ?? existing.isActive,
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        staff: { select: { id: true, name: true } },
      },
    })

    // Update group staff assignment if staff changed
    if (staffId !== undefined && activity.groupId) {
      // Remove old staff
      await prisma.staffGroupAssignment.deleteMany({
        where: { groupId: activity.groupId },
      })
      // Add new staff
      if (staffId) {
        await prisma.staffGroupAssignment.create({
          data: {
            userId: staffId,
            groupId: activity.groupId,
            canMessage: true,
            canManage: true,
          },
        })
      }
    }

    logAudit({ req, action: 'UPDATE', resourceType: 'ECA_ACTIVITY', resourceId: activity.id, metadata: { name: activity.name } })

    res.json({
      ...activity,
      eligibleYearGroupIds: JSON.parse(activity.eligibleYearGroupIds as string),
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating ECA activity:', error)
    res.status(500).json({ error: 'Failed to update ECA activity' })
  }
})

// Delete activity
router.delete('/activities/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { ecaTerm: true },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    // Only allow deletion in DRAFT status
    if (activity.ecaTerm.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Activities can only be deleted during draft phase' })
    }

    // Delete associated group
    if (activity.groupId) {
      await prisma.group.delete({ where: { id: activity.groupId } })
    }

    await prisma.ecaActivity.delete({ where: { id } })

    logAudit({ req, action: 'DELETE', resourceType: 'ECA_ACTIVITY', resourceId: id, metadata: { name: activity.name } })

    res.json({ message: 'Activity deleted successfully' })
  } catch (error) {
    console.error('Error deleting ECA activity:', error)
    res.status(500).json({ error: 'Failed to delete ECA activity' })
  }
})

// Cancel activity
router.patch('/activities/:id/cancel', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { reason } = req.body

    const existing = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!existing) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const activity = await prisma.ecaActivity.update({
      where: { id },
      data: {
        isCancelled: true,
        cancelReason: reason || 'Cancelled by admin',
      },
    })

    // Remove allocations
    await prisma.ecaAllocation.updateMany({
      where: { ecaActivityId: id },
      data: { status: 'REMOVED' },
    })

    logAudit({ req, action: 'UPDATE', resourceType: 'ECA_ACTIVITY', resourceId: id, metadata: { name: activity.name, cancelled: true } })

    res.json({
      ...activity,
      eligibleYearGroupIds: JSON.parse(activity.eligibleYearGroupIds as string),
      createdAt: activity.createdAt.toISOString(),
      updatedAt: activity.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error cancelling activity:', error)
    res.status(500).json({ error: 'Failed to cancel activity' })
  }
})

// Get allocated students for activity
router.get('/activities/:id/students', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const allocations = await prisma.ecaAllocation.findMany({
      where: { ecaActivityId: id, status: 'CONFIRMED' },
      include: {
        student: {
          include: {
            class: { select: { name: true } },
          },
        },
      },
      orderBy: { student: { lastName: 'asc' } },
    })

    res.json(allocations.map(a => ({
      id: a.id,
      studentId: a.student.id,
      studentName: `${a.student.firstName} ${a.student.lastName}`,
      className: a.student.class.name,
      allocationType: a.allocationType,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching activity students:', error)
    res.status(500).json({ error: 'Failed to fetch students' })
  }
})

// Add student manually
router.post('/activities/:id/students', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { studentId } = req.body

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { ecaTerm: true },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    // Check capacity
    const currentCount = await prisma.ecaAllocation.count({
      where: { ecaActivityId: id, status: 'CONFIRMED' },
    })

    if (activity.maxCapacity && currentCount >= activity.maxCapacity) {
      return res.status(400).json({ error: 'Activity is at full capacity' })
    }

    const allocation = await prisma.ecaAllocation.create({
      data: {
        ecaTermId: activity.ecaTermId,
        studentId,
        ecaActivityId: id,
        allocationType: 'MANUAL',
        status: 'CONFIRMED',
      },
      include: {
        student: {
          include: { class: { select: { name: true } } },
        },
      },
    })

    // Add student to group
    if (activity.groupId) {
      await prisma.studentGroupLink.upsert({
        where: { studentId_groupId: { studentId, groupId: activity.groupId } },
        update: {},
        create: { studentId, groupId: activity.groupId },
      })
    }

    logAudit({ req, action: 'UPDATE', resourceType: 'ECA_ALLOCATION', resourceId: allocation.id, metadata: { activityName: activity.name, studentId, action: 'manual_add' } })

    res.status(201).json({
      id: allocation.id,
      studentId: allocation.student.id,
      studentName: `${allocation.student.firstName} ${allocation.student.lastName}`,
      className: allocation.student.class.name,
      allocationType: allocation.allocationType,
      status: allocation.status,
      createdAt: allocation.createdAt.toISOString(),
    })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Student is already allocated to this activity' })
    }
    console.error('Error adding student:', error)
    res.status(500).json({ error: 'Failed to add student' })
  }
})

// Remove student
router.delete('/activities/:id/students/:studentId', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id, studentId } = req.params

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    await prisma.ecaAllocation.updateMany({
      where: { ecaActivityId: id, studentId },
      data: { status: 'REMOVED' },
    })

    // Remove from group
    if (activity.groupId) {
      await prisma.studentGroupLink.deleteMany({
        where: { studentId, groupId: activity.groupId },
      })
    }

    logAudit({ req, action: 'UPDATE', resourceType: 'ECA_ALLOCATION', resourceId: id, metadata: { activityName: activity.name, studentId, action: 'removed' } })

    res.json({ message: 'Student removed successfully' })
  } catch (error) {
    console.error('Error removing student:', error)
    res.status(500).json({ error: 'Failed to remove student' })
  }
})

// Get waitlist
router.get('/activities/:id/waitlist', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const waitlist = await prisma.ecaWaitlist.findMany({
      where: { ecaActivityId: id },
      include: {
        student: {
          include: { class: { select: { name: true } } },
        },
      },
      orderBy: { position: 'asc' },
    })

    res.json(waitlist.map(w => ({
      id: w.id,
      studentId: w.student.id,
      studentName: `${w.student.firstName} ${w.student.lastName}`,
      className: w.student.class.name,
      position: w.position,
      createdAt: w.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching waitlist:', error)
    res.status(500).json({ error: 'Failed to fetch waitlist' })
  }
})

// Promote from waitlist
router.post('/activities/:id/waitlist/:studentId/promote', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id, studentId } = req.params

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { ecaTerm: true },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    // Check capacity
    const currentCount = await prisma.ecaAllocation.count({
      where: { ecaActivityId: id, status: 'CONFIRMED' },
    })

    if (activity.maxCapacity && currentCount >= activity.maxCapacity) {
      return res.status(400).json({ error: 'Activity is at full capacity' })
    }

    // Create allocation
    await prisma.ecaAllocation.create({
      data: {
        ecaTermId: activity.ecaTermId,
        studentId,
        ecaActivityId: id,
        allocationType: 'MANUAL',
        status: 'CONFIRMED',
      },
    })

    // Remove from waitlist
    await prisma.ecaWaitlist.deleteMany({
      where: { ecaActivityId: id, studentId },
    })

    // Add to group
    if (activity.groupId) {
      await prisma.studentGroupLink.upsert({
        where: { studentId_groupId: { studentId, groupId: activity.groupId } },
        update: {},
        create: { studentId, groupId: activity.groupId },
      })
    }

    logAudit({ req, action: 'UPDATE', resourceType: 'ECA_ALLOCATION', resourceId: id, metadata: { activityName: activity.name, studentId, action: 'promoted_from_waitlist' } })

    res.json({ message: 'Student promoted from waitlist' })
  } catch (error) {
    console.error('Error promoting from waitlist:', error)
    res.status(500).json({ error: 'Failed to promote from waitlist' })
  }
})

// Invite students
router.post('/activities/:id/invite', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { studentIds, isTryout } = req.body

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const invitations = await Promise.all(
      studentIds.map(async (studentId: string) => {
        try {
          return await prisma.ecaInvitation.create({
            data: {
              ecaActivityId: id,
              studentId,
              invitedById: user.id,
              isTryout: isTryout || false,
              status: 'PENDING',
            },
            include: {
              student: {
                include: { class: { select: { name: true } } },
              },
            },
          })
        } catch {
          return null // Skip duplicates
        }
      })
    )

    res.json({
      created: invitations.filter(Boolean).length,
      invitations: invitations.filter(Boolean).map(i => ({
        id: i!.id,
        studentId: i!.student.id,
        studentName: `${i!.student.firstName} ${i!.student.lastName}`,
        className: i!.student.class.name,
        status: i!.status,
        isTryout: i!.isTryout,
        createdAt: i!.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error inviting students:', error)
    res.status(500).json({ error: 'Failed to invite students' })
  }
})

// Update invitation (for tryout results)
router.patch('/invitations/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { status, tryoutResult } = req.body

    const invitation = await prisma.ecaInvitation.findFirst({
      where: { id },
      include: {
        ecaActivity: { select: { schoolId: true } },
      },
    })

    if (!invitation || invitation.ecaActivity.schoolId !== user.schoolId) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    const updated = await prisma.ecaInvitation.update({
      where: { id },
      data: {
        status: status ?? invitation.status,
        tryoutResult: tryoutResult ?? invitation.tryoutResult,
      },
    })

    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error updating invitation:', error)
    res.status(500).json({ error: 'Failed to update invitation' })
  }
})

// Run allocation
router.post('/terms/:id/run-allocation', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const term = await prisma.ecaTerm.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!term) {
      return res.status(404).json({ error: 'Term not found' })
    }

    if (term.status !== 'REGISTRATION_CLOSED') {
      return res.status(400).json({ error: 'Allocation can only be run after registration closes' })
    }

    const result = await runAllocation(id, user.schoolId)

    logAudit({ req, action: 'CREATE', resourceType: 'ECA_ALLOCATION', resourceId: id, metadata: { termName: term.name, ...result } })

    res.json(result)
  } catch (error) {
    console.error('Error running allocation:', error)
    res.status(500).json({ error: 'Failed to run allocation' })
  }
})

// Preview allocation
router.get('/terms/:id/allocation-preview', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const term = await prisma.ecaTerm.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!term) {
      return res.status(404).json({ error: 'Term not found' })
    }

    const preview = await previewAllocation(id, user.schoolId)

    res.json(preview)
  } catch (error) {
    console.error('Error previewing allocation:', error)
    res.status(500).json({ error: 'Failed to preview allocation' })
  }
})

// Publish allocation
router.post('/terms/:id/publish-allocation', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const term = await prisma.ecaTerm.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!term) {
      return res.status(404).json({ error: 'Term not found' })
    }

    if (!term.allocationRun) {
      return res.status(400).json({ error: 'Allocation must be run before publishing' })
    }

    // Update term status
    await prisma.ecaTerm.update({
      where: { id },
      data: { status: 'ALLOCATION_COMPLETE' },
    })

    // Sync group memberships
    const allocations = await prisma.ecaAllocation.findMany({
      where: { ecaTermId: id, status: 'CONFIRMED' },
      include: { ecaActivity: { select: { groupId: true } } },
    })

    for (const allocation of allocations) {
      if (allocation.ecaActivity.groupId) {
        await prisma.studentGroupLink.upsert({
          where: {
            studentId_groupId: {
              studentId: allocation.studentId,
              groupId: allocation.ecaActivity.groupId,
            },
          },
          update: {},
          create: {
            studentId: allocation.studentId,
            groupId: allocation.ecaActivity.groupId,
          },
        })
      }
    }

    // TODO: Send notifications to parents

    logAudit({ req, action: 'UPDATE', resourceType: 'ECA_TERM', resourceId: id, metadata: { termName: term.name, action: 'published_allocation' } })

    res.json({ message: 'Allocation published successfully' })
  } catch (error) {
    console.error('Error publishing allocation:', error)
    res.status(500).json({ error: 'Failed to publish allocation' })
  }
})

// Get attendance for activity
router.get('/activities/:id/attendance', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { date } = req.query

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const sessionDate = date ? new Date(date as string) : new Date()
    sessionDate.setHours(0, 0, 0, 0)

    const nextDay = new Date(sessionDate)
    nextDay.setDate(nextDay.getDate() + 1)

    // Get allocated students
    const allocations = await prisma.ecaAllocation.findMany({
      where: { ecaActivityId: id, status: 'CONFIRMED' },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { student: { lastName: 'asc' } },
    })

    // Get attendance for the date
    const attendance = await prisma.ecaAttendance.findMany({
      where: {
        ecaActivityId: id,
        sessionDate: { gte: sessionDate, lt: nextDay },
      },
    })

    res.json({
      date: sessionDate.toISOString().split('T')[0],
      students: allocations.map(a => {
        const record = attendance.find(att => att.studentId === a.studentId)
        return {
          studentId: a.student.id,
          studentName: `${a.student.firstName} ${a.student.lastName}`,
          status: record?.status || null,
          note: record?.note || null,
        }
      }),
    })
  } catch (error) {
    console.error('Error fetching attendance:', error)
    res.status(500).json({ error: 'Failed to fetch attendance' })
  }
})

// Mark attendance
router.post('/activities/:id/attendance', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { sessionDate, records } = req.body

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { ecaTerm: true },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    const date = new Date(sessionDate)
    date.setHours(0, 0, 0, 0)

    // Upsert attendance records
    for (const record of records) {
      await prisma.ecaAttendance.upsert({
        where: {
          ecaActivityId_studentId_sessionDate: {
            ecaActivityId: id,
            studentId: record.studentId,
            sessionDate: date,
          },
        },
        update: {
          status: record.status,
          note: record.note || null,
          markedById: user.id,
        },
        create: {
          ecaTermId: activity.ecaTermId,
          ecaActivityId: id,
          studentId: record.studentId,
          sessionDate: date,
          status: record.status,
          note: record.note || null,
          markedById: user.id,
        },
      })
    }

    res.json({ message: 'Attendance saved successfully' })
  } catch (error) {
    console.error('Error saving attendance:', error)
    res.status(500).json({ error: 'Failed to save attendance' })
  }
})

// Export attendance as HTML (for PDF printing)
router.get('/activities/:id/attendance/export', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { startDate, endDate, blank } = req.query

    const activity = await prisma.ecaActivity.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' })
    }

    let html: string
    if (blank === 'true') {
      html = await generateBlankRegisterHtml(id)
    } else {
      const start = startDate ? new Date(startDate as string) : new Date()
      const end = endDate ? new Date(endDate as string) : new Date()
      html = await generateAttendanceRegisterHtml(id, start, end)
    }

    res.setHeader('Content-Type', 'text/html')
    res.send(html)
  } catch (error) {
    console.error('Error exporting attendance:', error)
    res.status(500).json({ error: 'Failed to export attendance' })
  }
})

// ============================================
// PARENT ENDPOINTS
// ============================================

// Get active/upcoming terms for parent
router.get('/parent/terms', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    console.log('[ECA Debug] GET /parent/terms called by user:', user.id, user.email)

    const terms = await prisma.ecaTerm.findMany({
      where: {
        schoolId: user.schoolId,
        status: { in: ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ALLOCATION_COMPLETE', 'ACTIVE'] },
      },
      orderBy: [{ academicYear: 'desc' }, { termNumber: 'desc' }],
    })

    res.json(terms.map(t => ({
      ...t,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      registrationOpens: t.registrationOpens.toISOString(),
      registrationCloses: t.registrationCloses.toISOString(),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching parent ECA terms:', error)
    res.status(500).json({ error: 'Failed to fetch ECA terms' })
  }
})

// Get term with eligible activities for parent's children
router.get('/parent/terms/:id', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { studentId } = req.query
    console.log('[ECA Debug] GET /parent/terms/:id called - termId:', id, 'studentId:', studentId, 'user:', user.email)

    const term = await prisma.ecaTerm.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        activities: {
          where: { isActive: true, isCancelled: false },
          include: {
            category: { select: { id: true, name: true, icon: true, color: true } },
            staff: { select: { id: true, name: true } },
            _count: {
              select: { allocations: { where: { status: 'CONFIRMED' } } },
            },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: 'asc' }, { name: 'asc' }],
        },
      },
    })

    if (!term) {
      return res.status(404).json({ error: 'Term not found' })
    }

    // Get parent's children
    const studentLinks = user.studentLinks || []
    const studentIds = studentLinks.map(l => l.studentId)

    console.log('[ECA Debug] Parent user:', user.id, user.email)
    console.log('[ECA Debug] Student links:', studentLinks.length, 'studentIds:', studentIds)

    // Get students with their details
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: {
        class: {
          include: { yearGroup: true },
        },
      },
    })

    console.log('[ECA Debug] Students found:', students.map(s => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      classId: s.classId,
      className: s.class.name,
      yearGroupId: s.class.yearGroupId,
      yearGroupName: s.class.yearGroup?.name,
    })))

    // Get existing selections for this parent/term
    const existingSelections = await prisma.ecaSelection.findMany({
      where: {
        ecaTermId: id,
        studentId: studentId ? (studentId as string) : { in: studentIds },
        parentUserId: user.id,
      },
    })

    // Get invitations for parent's children
    const invitations = await prisma.ecaInvitation.findMany({
      where: {
        studentId: studentId ? (studentId as string) : { in: studentIds },
        ecaActivity: { ecaTermId: id },
        status: 'PENDING',
      },
    })

    console.log('[ECA Debug] Term activities count:', term.activities.length)
    term.activities.forEach(a => {
      console.log('[ECA Debug] Activity:', a.id, a.name, 'eligibleYearGroupIds:', a.eligibleYearGroupIds)
    })

    // Build activities with eligibility info
    const activitiesWithEligibility = term.activities.map(activity => {
      const eligibleYearGroupIds = JSON.parse(activity.eligibleYearGroupIds as string) as string[]

      // Check eligibility for the requested student (or first student)
      const targetStudentId = studentId as string || studentIds[0]
      const student = students.find(s => s.id === targetStudentId)

      console.log('[ECA Debug] Checking activity:', activity.name, 'for student:', targetStudentId)
      console.log('[ECA Debug] Activity eligibleYearGroupIds:', eligibleYearGroupIds)
      console.log('[ECA Debug] Student class yearGroupId:', student?.class.yearGroupId)

      let isEligible = true
      let eligibilityReason: string | null = null

      if (student) {
        // Year group check
        if (eligibleYearGroupIds.length > 0 && student.class.yearGroupId) {
          if (!eligibleYearGroupIds.includes(student.class.yearGroupId)) {
            isEligible = false
            eligibilityReason = 'Not in eligible year group'
            console.log('[ECA Debug] NOT ELIGIBLE - yearGroup mismatch')
          } else {
            console.log('[ECA Debug] ELIGIBLE - yearGroup matches')
          }
        } else {
          console.log('[ECA Debug] ELIGIBLE - no yearGroup restriction or student has no yearGroup')
        }

        // Gender check (would need gender field on Student)
        // For now, skip gender eligibility check

        // Activity type check
        if (activity.activityType === 'INVITE_ONLY' || activity.activityType === 'TRYOUT') {
          const hasInvitation = invitations.some(
            i => i.ecaActivityId === activity.id && i.studentId === targetStudentId
          )
          if (!hasInvitation) {
            isEligible = false
            eligibilityReason = 'Requires invitation'
          }
        }
      }

      // Selection info
      const selection = existingSelections.find(
        s => s.ecaActivityId === activity.id && s.studentId === targetStudentId
      )
      const invitation = invitations.find(
        i => i.ecaActivityId === activity.id && i.studentId === targetStudentId
      )

      return {
        ...activity,
        eligibleYearGroupIds,
        currentEnrollment: activity._count.allocations,
        isEligible,
        eligibilityReason,
        currentlySelected: !!selection,
        selectedRank: selection?.rank || null,
        isPrioritySelected: selection?.isPriority || false,
        availableSpots: activity.maxCapacity
          ? Math.max(0, activity.maxCapacity - activity._count.allocations)
          : null,
        hasInvitation: !!invitation,
        invitationId: invitation?.id || null,
        createdAt: activity.createdAt.toISOString(),
        updatedAt: activity.updatedAt.toISOString(),
      }
    })

    res.json({
      ...term,
      startDate: term.startDate.toISOString(),
      endDate: term.endDate.toISOString(),
      registrationOpens: term.registrationOpens.toISOString(),
      registrationCloses: term.registrationCloses.toISOString(),
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
      activities: activitiesWithEligibility,
    })
  } catch (error) {
    console.error('Error fetching parent ECA term:', error)
    res.status(500).json({ error: 'Failed to fetch ECA term' })
  }
})

// Get current selections
router.get('/parent/terms/:id/selections', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const studentLinks = user.studentLinks || []
    const studentIds = studentLinks.map(l => l.studentId)

    const selections = await prisma.ecaSelection.findMany({
      where: {
        ecaTermId: id,
        studentId: { in: studentIds },
        parentUserId: user.id,
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        ecaActivity: {
          select: { id: true, name: true, dayOfWeek: true, timeSlot: true },
        },
      },
      orderBy: [{ studentId: 'asc' }, { ecaActivity: { dayOfWeek: 'asc' } }, { rank: 'asc' }],
    })

    // Group by student
    const byStudent = new Map<string, any[]>()
    for (const selection of selections) {
      const key = selection.studentId
      if (!byStudent.has(key)) {
        byStudent.set(key, [])
      }
      byStudent.get(key)!.push({
        activityId: selection.ecaActivity.id,
        activityName: selection.ecaActivity.name,
        dayOfWeek: selection.ecaActivity.dayOfWeek,
        timeSlot: selection.ecaActivity.timeSlot,
        rank: selection.rank,
        isPriority: selection.isPriority,
      })
    }

    res.json(Array.from(byStudent.entries()).map(([studentId, sels]) => {
      const student = selections.find(s => s.studentId === studentId)?.student
      return {
        termId: id,
        studentId,
        studentName: student ? `${student.firstName} ${student.lastName}` : '',
        selections: sels,
      }
    }))
  } catch (error) {
    console.error('Error fetching parent selections:', error)
    res.status(500).json({ error: 'Failed to fetch selections' })
  }
})

// Submit selections
router.post('/parent/terms/:id/selections', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { studentId, selections } = req.body

    // Verify term is open for registration
    const term = await prisma.ecaTerm.findFirst({
      where: { id, schoolId: user.schoolId },
    })

    if (!term) {
      return res.status(404).json({ error: 'Term not found' })
    }

    if (term.status !== 'REGISTRATION_OPEN') {
      return res.status(400).json({ error: 'Registration is not open' })
    }

    // Verify student belongs to parent
    const studentLinks = user.studentLinks || []
    if (!studentLinks.some(l => l.studentId === studentId)) {
      return res.status(403).json({ error: 'Not authorized for this student' })
    }

    // Delete existing selections for this student/term
    await prisma.ecaSelection.deleteMany({
      where: {
        ecaTermId: id,
        studentId,
        parentUserId: user.id,
      },
    })

    // Create new selections
    const created = await Promise.all(
      selections.map(async (sel: { activityId: string; rank: number; isPriority: boolean }) => {
        return prisma.ecaSelection.create({
          data: {
            ecaTermId: id,
            studentId,
            parentUserId: user.id,
            ecaActivityId: sel.activityId,
            rank: sel.rank,
            isPriority: sel.isPriority || false,
          },
        })
      })
    )

    res.json({
      message: 'Selections saved successfully',
      count: created.length,
    })
  } catch (error) {
    console.error('Error saving selections:', error)
    res.status(500).json({ error: 'Failed to save selections' })
  }
})

// Get all allocations for parent's children
router.get('/parent/allocations', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const studentLinks = user.studentLinks || []
    const studentIds = studentLinks.map(l => l.studentId)

    const allocations = await prisma.ecaAllocation.findMany({
      where: {
        studentId: { in: studentIds },
        status: 'CONFIRMED',
        ecaTerm: { status: { in: ['ALLOCATION_COMPLETE', 'ACTIVE'] } },
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        ecaActivity: {
          select: {
            id: true,
            name: true,
            dayOfWeek: true,
            timeSlot: true,
            customStartTime: true,
            customEndTime: true,
            location: true,
            staff: { select: { name: true } },
          },
        },
        ecaTerm: {
          select: {
            defaultBeforeSchoolStart: true,
            defaultBeforeSchoolEnd: true,
            defaultAfterSchoolStart: true,
            defaultAfterSchoolEnd: true,
          },
        },
      },
      orderBy: [{ ecaActivity: { dayOfWeek: 'asc' } }, { ecaActivity: { timeSlot: 'asc' } }],
    })

    // Group by student
    const byStudent = new Map<string, any[]>()
    for (const allocation of allocations) {
      const key = allocation.studentId
      if (!byStudent.has(key)) {
        byStudent.set(key, [])
      }

      const startTime = allocation.ecaActivity.customStartTime ||
        (allocation.ecaActivity.timeSlot === 'BEFORE_SCHOOL'
          ? allocation.ecaTerm.defaultBeforeSchoolStart
          : allocation.ecaTerm.defaultAfterSchoolStart)
      const endTime = allocation.ecaActivity.customEndTime ||
        (allocation.ecaActivity.timeSlot === 'BEFORE_SCHOOL'
          ? allocation.ecaTerm.defaultBeforeSchoolEnd
          : allocation.ecaTerm.defaultAfterSchoolEnd)

      byStudent.get(key)!.push({
        activityId: allocation.ecaActivity.id,
        activityName: allocation.ecaActivity.name,
        dayOfWeek: allocation.ecaActivity.dayOfWeek,
        timeSlot: allocation.ecaActivity.timeSlot,
        location: allocation.ecaActivity.location,
        startTime,
        endTime,
        staffName: allocation.ecaActivity.staff?.name || null,
        status: allocation.status,
      })
    }

    res.json(Array.from(byStudent.entries()).map(([studentId, allocs]) => {
      const student = allocations.find(a => a.studentId === studentId)?.student
      return {
        studentId,
        studentName: student ? `${student.firstName} ${student.lastName}` : '',
        allocations: allocs,
      }
    }))
  } catch (error) {
    console.error('Error fetching parent allocations:', error)
    res.status(500).json({ error: 'Failed to fetch allocations' })
  }
})

// Get pending invitations for parent's children
router.get('/parent/invitations', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const studentLinks = user.studentLinks || []
    const studentIds = studentLinks.map(l => l.studentId)

    const invitations = await prisma.ecaInvitation.findMany({
      where: {
        studentId: { in: studentIds },
        status: 'PENDING',
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        ecaActivity: {
          select: {
            id: true,
            name: true,
            description: true,
            dayOfWeek: true,
            timeSlot: true,
            location: true,
          },
        },
        invitedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(invitations.map(i => ({
      id: i.id,
      studentId: i.student.id,
      studentName: `${i.student.firstName} ${i.student.lastName}`,
      activityId: i.ecaActivity.id,
      activityName: i.ecaActivity.name,
      activityDescription: i.ecaActivity.description,
      dayOfWeek: i.ecaActivity.dayOfWeek,
      timeSlot: i.ecaActivity.timeSlot,
      location: i.ecaActivity.location,
      isTryout: i.isTryout,
      invitedByName: i.invitedBy.name,
      createdAt: i.createdAt.toISOString(),
    })))
  } catch (error) {
    console.error('Error fetching parent invitations:', error)
    res.status(500).json({ error: 'Failed to fetch invitations' })
  }
})

// Respond to invitation
router.post('/parent/invitations/:id/respond', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params
    const { accept } = req.body

    const invitation = await prisma.ecaInvitation.findFirst({
      where: { id },
      include: {
        ecaActivity: {
          include: { ecaTerm: true },
        },
      },
    })

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    // Verify student belongs to parent
    const studentLinks = user.studentLinks || []
    if (!studentLinks.some(l => l.studentId === invitation.studentId)) {
      return res.status(403).json({ error: 'Not authorized for this student' })
    }

    if (accept) {
      // Create allocation
      await prisma.ecaAllocation.create({
        data: {
          ecaTermId: invitation.ecaActivity.ecaTermId,
          studentId: invitation.studentId,
          ecaActivityId: invitation.ecaActivityId,
          allocationType: 'INVITED',
          status: 'CONFIRMED',
        },
      })

      // Update invitation status
      await prisma.ecaInvitation.update({
        where: { id },
        data: { status: 'ACCEPTED' },
      })

      // Add to group
      if (invitation.ecaActivity.groupId) {
        await prisma.studentGroupLink.upsert({
          where: {
            studentId_groupId: {
              studentId: invitation.studentId,
              groupId: invitation.ecaActivity.groupId,
            },
          },
          update: {},
          create: {
            studentId: invitation.studentId,
            groupId: invitation.ecaActivity.groupId,
          },
        })
      }

      res.json({ message: 'Invitation accepted' })
    } else {
      await prisma.ecaInvitation.update({
        where: { id },
        data: { status: 'DECLINED' },
      })

      res.json({ message: 'Invitation declined' })
    }
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Already allocated to this activity' })
    }
    console.error('Error responding to invitation:', error)
    res.status(500).json({ error: 'Failed to respond to invitation' })
  }
})

export default router
