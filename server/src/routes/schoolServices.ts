import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin, loadUserWithRelations } from '../middleware/auth.js'

const router = Router()

// Helper to parse JSON string fields safely
function parseJsonField(value: string | null | undefined): string[] | null {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

// Helper to serialize a service for API response
function serializeService(service: any) {
  return {
    ...service,
    days: parseJsonField(service.days) || [],
    eligibleClasses: parseJsonField(service.eligibleClasses),
    eligibleYears: parseJsonField(service.eligibleYears),
  }
}

function serializeRegistration(reg: any) {
  return {
    ...reg,
    days: parseJsonField(reg.days) || [],
    parentName: reg.parent?.name,
    parentEmail: reg.parent?.email,
    serviceName: reg.service?.name,
  }
}

// ============================================
// PARENT ENDPOINTS (must be before /:id routes)
// ============================================

// List available services for this parent's children
router.get('/parent', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const services = await prisma.schoolService.findMany({
      where: {
        schoolId: user.schoolId,
        status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ACTIVE'] },
      },
      include: {
        _count: { select: { registrations: { where: { status: { not: 'CANCELLED' } } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    // Get student class/year info for eligibility filtering
    const studentClasses = user.studentLinks?.map((l) => l.student.class.name) || []
    const studentClassIds = user.studentLinks?.map((l) => l.student.classId) || []

    // Look up year group names for the student's classes
    const classes = await prisma.class.findMany({
      where: { id: { in: studentClassIds } },
      include: { yearGroup: true },
    })
    const studentYears = classes.map((c) => c.yearGroup?.name).filter(Boolean) as string[]

    const filtered = services.filter((s) => {
      const eligClasses = parseJsonField(s.eligibleClasses)
      const eligYears = parseJsonField(s.eligibleYears)

      if (eligClasses && eligClasses.length > 0) {
        if (!studentClasses.some((sc) => eligClasses.includes(sc))) return false
      }
      if (eligYears && eligYears.length > 0) {
        if (!studentYears.some((sy) => eligYears.includes(sy))) return false
      }
      return true
    })

    res.json(
      filtered.map((s) => ({
        ...serializeService(s),
        registeredCount: s._count.registrations,
      }))
    )
  } catch (error) {
    console.error('Error listing parent services:', error)
    res.status(500).json({ error: 'Failed to list services' })
  }
})

// Get all active registrations for parent
router.get('/parent/my-registrations', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const registrations = await prisma.serviceRegistration.findMany({
      where: {
        parentId: user.id,
        status: { not: 'CANCELLED' },
      },
      include: {
        service: { select: { name: true, startTime: true, endTime: true, days: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(
      registrations.map((r) => ({
        ...serializeRegistration(r),
        serviceName: r.service.name,
      }))
    )
  } catch (error) {
    console.error('Error getting my registrations:', error)
    res.status(500).json({ error: 'Failed to get registrations' })
  }
})

// Get service detail with availability (parent)
router.get('/parent/:id', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const service = await prisma.schoolService.findFirst({
      where: {
        id: req.params.id,
        schoolId: user.schoolId,
        status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ACTIVE'] },
      },
      include: {
        _count: { select: { registrations: { where: { status: { not: 'CANCELLED' } } } } },
      },
    })

    if (!service) return res.status(404).json({ error: 'Service not found' })

    res.json({
      ...serializeService(service),
      registeredCount: service._count.registrations,
    })
  } catch (error) {
    console.error('Error getting parent service:', error)
    res.status(500).json({ error: 'Failed to get service' })
  }
})

// Register a child for a service
router.post('/parent/register', isAuthenticated, async (req, res) => {
  try {
    const user = (await loadUserWithRelations(req.user!.id))!
    const { serviceId, studentId, studentName, className, days, notes, startDate } = req.body

    if (!serviceId || !studentId || !studentName || !className || !days || !days.length) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const service = await prisma.schoolService.findFirst({
      where: { id: serviceId, schoolId: user.schoolId },
    })
    if (!service) return res.status(404).json({ error: 'Service not found' })

    if (service.status !== 'REGISTRATION_OPEN') {
      return res.status(400).json({ error: 'Registration is not open for this service' })
    }

    // Verify student belongs to this parent
    const studentLink = user.studentLinks?.find((l) => l.student.id === studentId)
    if (!studentLink) {
      return res.status(403).json({ error: 'Student not linked to your account' })
    }

    // Check class eligibility
    const eligClasses = parseJsonField(service.eligibleClasses)
    if (eligClasses && eligClasses.length > 0) {
      if (!eligClasses.includes(className)) {
        return res.status(400).json({ error: 'Student is not eligible for this service (class)' })
      }
    }

    // Check year group eligibility
    const eligYears = parseJsonField(service.eligibleYears)
    if (eligYears && eligYears.length > 0) {
      const studentClass = await prisma.class.findFirst({
        where: { id: studentLink.student.classId },
        include: { yearGroup: true },
      })
      if (studentClass?.yearGroup && !eligYears.includes(studentClass.yearGroup.name)) {
        return res.status(400).json({ error: 'Student is not eligible for this service (year group)' })
      }
    }

    // Check for duplicate
    const existing = await prisma.serviceRegistration.findUnique({
      where: { serviceId_studentId: { serviceId, studentId } },
    })
    if (existing && existing.status !== 'CANCELLED') {
      return res.status(400).json({ error: 'Student is already registered for this service' })
    }

    // Check capacity
    let registrationStatus: 'PENDING' | 'WAITLISTED' = 'PENDING'
    if (service.capacity) {
      const currentCount = await prisma.serviceRegistration.count({
        where: { serviceId, status: { not: 'CANCELLED' } },
      })
      if (currentCount >= service.capacity) {
        registrationStatus = 'WAITLISTED'
      }
    }

    // Create or upsert (re-register a previously cancelled one)
    const registration = existing
      ? await prisma.serviceRegistration.update({
          where: { id: existing.id },
          data: {
            parentId: user.id,
            studentName,
            className,
            days: JSON.stringify(days),
            status: registrationStatus,
            paymentStatus: 'UNPAID',
            notes: notes || null,
            startDate: startDate || null,
          },
        })
      : await prisma.serviceRegistration.create({
          data: {
            serviceId,
            parentId: user.id,
            studentId,
            studentName,
            className,
            days: JSON.stringify(days),
            status: registrationStatus,
            paymentStatus: 'UNPAID',
            notes: notes || null,
            startDate: startDate || null,
          },
        })

    res.json(serializeRegistration(registration))
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ error: 'Student is already registered for this service' })
    }
    console.error('Error registering for service:', error)
    res.status(500).json({ error: 'Failed to register' })
  }
})

// Cancel registration (parent)
router.delete('/parent/registrations/:regId', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const registration = await prisma.serviceRegistration.findFirst({
      where: { id: req.params.regId, parentId: user.id },
    })
    if (!registration) return res.status(404).json({ error: 'Registration not found' })

    await prisma.serviceRegistration.update({
      where: { id: req.params.regId },
      data: { status: 'CANCELLED' },
    })

    res.json({ message: 'Registration cancelled' })
  } catch (error) {
    console.error('Error cancelling registration:', error)
    res.status(500).json({ error: 'Failed to cancel registration' })
  }
})

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Update registration status (admin) — before /:id to avoid conflict
router.put('/registrations/:regId/status', isAdmin, async (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ['PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const registration = await prisma.serviceRegistration.update({
      where: { id: req.params.regId },
      data: { status },
      include: { parent: { select: { name: true, email: true } } },
    })

    res.json(serializeRegistration(registration))
  } catch (error) {
    console.error('Error updating registration status:', error)
    res.status(500).json({ error: 'Failed to update registration status' })
  }
})

// Update payment status (admin)
router.put('/registrations/:regId/payment', isAdmin, async (req, res) => {
  try {
    const { paymentStatus } = req.body
    const validStatuses = ['UNPAID', 'PAID', 'PARTIAL', 'WAIVED']
    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status' })
    }

    const registration = await prisma.serviceRegistration.update({
      where: { id: req.params.regId },
      data: { paymentStatus },
      include: { parent: { select: { name: true, email: true } } },
    })

    res.json(serializeRegistration(registration))
  } catch (error) {
    console.error('Error updating payment status:', error)
    res.status(500).json({ error: 'Failed to update payment status' })
  }
})

// List all services for school (admin)
router.get('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const services = await prisma.schoolService.findMany({
      where: { schoolId: user.schoolId },
      include: {
        _count: { select: { registrations: { where: { status: { not: 'CANCELLED' } } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    res.json(
      services.map((s) => ({
        ...serializeService(s),
        registeredCount: s._count.registrations,
      }))
    )
  } catch (error) {
    console.error('Error listing school services:', error)
    res.status(500).json({ error: 'Failed to list school services' })
  }
})

// Create service (admin)
router.post('/', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const {
      name, description, details, days, startTime, endTime,
      costPerSession, costPerWeek, costPerTerm, costDescription,
      capacity, eligibleClasses, eligibleYears, status,
      registrationOpens, registrationCloses, serviceStarts, serviceEnds,
      location, staffName, imageUrl, sortOrder,
    } = req.body

    const service = await prisma.schoolService.create({
      data: {
        schoolId: user.schoolId,
        name,
        description: description || null,
        details: details || null,
        days: JSON.stringify(days || []),
        startTime,
        endTime,
        costPerSession: costPerSession != null ? parseFloat(costPerSession) : null,
        costPerWeek: costPerWeek != null ? parseFloat(costPerWeek) : null,
        costPerTerm: costPerTerm != null ? parseFloat(costPerTerm) : null,
        costDescription: costDescription || null,
        capacity: capacity != null ? parseInt(capacity) : null,
        eligibleClasses: eligibleClasses ? JSON.stringify(eligibleClasses) : null,
        eligibleYears: eligibleYears ? JSON.stringify(eligibleYears) : null,
        status: status || 'DRAFT',
        registrationOpens: registrationOpens ? new Date(registrationOpens) : null,
        registrationCloses: registrationCloses ? new Date(registrationCloses) : null,
        serviceStarts: serviceStarts || null,
        serviceEnds: serviceEnds || null,
        location: location || null,
        staffName: staffName || null,
        imageUrl: imageUrl || null,
        sortOrder: sortOrder || 0,
      },
    })

    res.json(serializeService(service))
  } catch (error) {
    console.error('Error creating school service:', error)
    res.status(500).json({ error: 'Failed to create school service' })
  }
})

// Get service with registrations and stats (admin)
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const service = await prisma.schoolService.findFirst({
      where: { id: req.params.id, schoolId: user.schoolId },
      include: {
        registrations: {
          include: { parent: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!service) {
      return res.status(404).json({ error: 'Service not found' })
    }

    const nonCancelled = service.registrations.filter((r) => r.status !== 'CANCELLED')
    const result = {
      ...serializeService(service),
      registrations: service.registrations.map(serializeRegistration),
      registeredCount: nonCancelled.length,
      confirmedCount: nonCancelled.filter((r) => r.status === 'CONFIRMED').length,
      pendingCount: nonCancelled.filter((r) => r.status === 'PENDING').length,
      waitlistedCount: nonCancelled.filter((r) => r.status === 'WAITLISTED').length,
      paidCount: nonCancelled.filter((r) => r.paymentStatus === 'PAID').length,
      unpaidCount: nonCancelled.filter((r) => r.paymentStatus === 'UNPAID').length,
    }

    res.json(result)
  } catch (error) {
    console.error('Error getting school service:', error)
    res.status(500).json({ error: 'Failed to get school service' })
  }
})

// Update service (admin)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const existing = await prisma.schoolService.findFirst({
      where: { id: req.params.id, schoolId: user.schoolId },
    })
    if (!existing) return res.status(404).json({ error: 'Service not found' })

    const {
      name, description, details, days, startTime, endTime,
      costPerSession, costPerWeek, costPerTerm, costDescription,
      capacity, eligibleClasses, eligibleYears,
      registrationOpens, registrationCloses, serviceStarts, serviceEnds,
      location, staffName, imageUrl, sortOrder,
    } = req.body

    const data: any = {}
    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description || null
    if (details !== undefined) data.details = details || null
    if (days !== undefined) data.days = JSON.stringify(days)
    if (startTime !== undefined) data.startTime = startTime
    if (endTime !== undefined) data.endTime = endTime
    if (costPerSession !== undefined) data.costPerSession = costPerSession != null ? parseFloat(costPerSession) : null
    if (costPerWeek !== undefined) data.costPerWeek = costPerWeek != null ? parseFloat(costPerWeek) : null
    if (costPerTerm !== undefined) data.costPerTerm = costPerTerm != null ? parseFloat(costPerTerm) : null
    if (costDescription !== undefined) data.costDescription = costDescription || null
    if (capacity !== undefined) data.capacity = capacity != null ? parseInt(capacity) : null
    if (eligibleClasses !== undefined) data.eligibleClasses = eligibleClasses ? JSON.stringify(eligibleClasses) : null
    if (eligibleYears !== undefined) data.eligibleYears = eligibleYears ? JSON.stringify(eligibleYears) : null
    if (registrationOpens !== undefined) data.registrationOpens = registrationOpens ? new Date(registrationOpens) : null
    if (registrationCloses !== undefined) data.registrationCloses = registrationCloses ? new Date(registrationCloses) : null
    if (serviceStarts !== undefined) data.serviceStarts = serviceStarts || null
    if (serviceEnds !== undefined) data.serviceEnds = serviceEnds || null
    if (location !== undefined) data.location = location || null
    if (staffName !== undefined) data.staffName = staffName || null
    if (imageUrl !== undefined) data.imageUrl = imageUrl || null
    if (sortOrder !== undefined) data.sortOrder = sortOrder

    const service = await prisma.schoolService.update({
      where: { id: req.params.id },
      data,
    })

    res.json(serializeService(service))
  } catch (error) {
    console.error('Error updating school service:', error)
    res.status(500).json({ error: 'Failed to update school service' })
  }
})

// Delete service (DRAFT only, admin)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const service = await prisma.schoolService.findFirst({
      where: { id: req.params.id, schoolId: user.schoolId },
    })
    if (!service) return res.status(404).json({ error: 'Service not found' })
    if (service.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only draft services can be deleted' })
    }

    await prisma.schoolService.delete({ where: { id: req.params.id } })
    res.json({ message: 'Service deleted' })
  } catch (error) {
    console.error('Error deleting school service:', error)
    res.status(500).json({ error: 'Failed to delete school service' })
  }
})

// Update service status (admin)
router.put('/:id/status', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { status } = req.body
    const validStatuses = ['DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ACTIVE', 'ARCHIVED']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const existing = await prisma.schoolService.findFirst({
      where: { id: req.params.id, schoolId: user.schoolId },
    })
    if (!existing) return res.status(404).json({ error: 'Service not found' })

    const service = await prisma.schoolService.update({
      where: { id: req.params.id },
      data: { status },
    })

    res.json(serializeService(service))
  } catch (error) {
    console.error('Error updating service status:', error)
    res.status(500).json({ error: 'Failed to update service status' })
  }
})

// Get all registrations for a service (admin)
router.get('/:id/registrations', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const service = await prisma.schoolService.findFirst({
      where: { id: req.params.id, schoolId: user.schoolId },
    })
    if (!service) return res.status(404).json({ error: 'Service not found' })

    const registrations = await prisma.serviceRegistration.findMany({
      where: { serviceId: req.params.id },
      include: { parent: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    })

    res.json(registrations.map(serializeRegistration))
  } catch (error) {
    console.error('Error getting registrations:', error)
    res.status(500).json({ error: 'Failed to get registrations' })
  }
})

export default router
