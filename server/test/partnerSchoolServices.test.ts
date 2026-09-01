import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// The partner surface for School Services — Desk's directory, register and door.
const prismaMock = {
  partnerToken: { findUnique: vi.fn(), update: vi.fn() },
  school: { findFirst: vi.fn() },
  schoolService: { findMany: vi.fn(), findFirst: vi.fn() },
  serviceRegistration: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  student: { findMany: vi.fn(), findFirst: vi.fn() },
  parentStudentLink: { findFirst: vi.fn() },
  notification: { create: vi.fn() },
  deviceToken: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/outbox', () => ({ enqueuePush: vi.fn(), drainOutbox: vi.fn() }))
vi.mock('../src/services/notify', () => ({ sendNotification: vi.fn() }))
vi.mock('../src/services/firebase', () => ({ sendPushNotification: vi.fn(), removeInvalidTokens: vi.fn() }))
vi.mock('../src/services/hubStaffActor', () => ({ resolveHubStaffMembership: vi.fn(async () => null) }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const { default: partnerRoutes } = await import('../src/routes/partner')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/partner', partnerRoutes)
  return app
}
const auth = (r: request.Test) => r.set('Authorization', 'Bearer tok')

const SERVICE = {
  id: 'svc-1',
  name: 'Early Bird Club',
  description: 'Breakfast and games before school',
  details: null,
  days: '["Monday","Tuesday","Wednesday"]',
  startTime: '07:00',
  endTime: '08:00',
  location: 'Hall',
  collectionLocation: 'Side gate',
  staffName: 'Mrs Ahmed',
  status: 'REGISTRATION_OPEN',
  registrationOpens: null,
  registrationCloses: null,
  serviceStarts: null,
  serviceEnds: null,
  costPerSession: 5, costPerWeek: null, costPerTerm: null,
  costDescription: null, costIsFrom: false, currency: 'AED', paymentMethod: 'ONLINE',
  capacity: 2,
  eligibleClasses: null,
  eligibleYears: null,
  sortOrder: 0,
  _count: { registrations: 1 },
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.partnerToken.findUnique.mockResolvedValue({ id: 'pt-1', name: 'Desk', revokedAt: null })
  prismaMock.partnerToken.update.mockResolvedValue({})
  prismaMock.school.findFirst.mockResolvedValue({ id: 'school-1' })
  prismaMock.deviceToken.findMany.mockResolvedValue([])
  prismaMock.notification.create.mockResolvedValue({})
})

describe('GET /api/partner/services', () => {
  it('lists what the school runs, with places left', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([SERVICE])

    const res = await auth(request(makeApp()).get('/api/partner/services?school_id=hub-1'))

    expect(res.status).toBe(200)
    expect(res.body.services[0]).toMatchObject({
      id: 'svc-1',
      name: 'Early Bird Club',
      days: ['Monday', 'Tuesday', 'Wednesday'],
      registeredCount: 1,
      spotsLeft: 1,
      // Desk staff get asked "where do I pick them up?" more than anyone.
      collectionLocation: 'Side gate',
    })
  })

  // A service the school is still writing is not a thing that exists yet.
  it('never returns DRAFT services', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([])
    await auth(request(makeApp()).get('/api/partner/services?school_id=hub-1'))
    expect(prismaMock.schoolService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'DRAFT' } }) }),
    )
  })

  it('unlimited capacity reports no place limit rather than zero left', async () => {
    prismaMock.schoolService.findMany.mockResolvedValue([{ ...SERVICE, capacity: null }])
    const res = await auth(request(makeApp()).get('/api/partner/services?school_id=hub-1'))
    expect(res.body.services[0].spotsLeft).toBeNull()
  })

  // Desk probes ids across every Wasil product; one we don't host is not an error.
  it('returns an empty list for a school we do not host', async () => {
    prismaMock.school.findFirst.mockResolvedValue(null)
    const res = await auth(request(makeApp()).get('/api/partner/services?school_id=nope'))
    expect(res.status).toBe(200)
    expect(res.body.services).toEqual([])
  })

  it('401 without a partner token', async () => {
    const res = await request(makeApp()).get('/api/partner/services?school_id=hub-1')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/partner/services/:id/registrations', () => {
  const REGS = [
    { id: 'r-1', studentId: 'stu-1', studentName: 'Amir Khan', className: '3A', days: '["Monday","Tuesday"]', status: 'PENDING', paymentStatus: 'UNPAID', notes: 'Nut allergy', startDate: null, createdAt: new Date('2026-08-01') },
    { id: 'r-2', studentId: 'stu-2', studentName: 'Bea Cole', className: '3B', days: '["Tuesday"]', status: 'CONFIRMED', paymentStatus: 'PAID', notes: null, startDate: null, createdAt: new Date('2026-08-02') },
  ]

  beforeEach(() => {
    prismaMock.schoolService.findFirst.mockResolvedValue(SERVICE)
    prismaMock.serviceRegistration.findMany.mockResolvedValue(REGS)
    prismaMock.student.findMany.mockResolvedValue([
      { id: 'stu-1', hubPupilId: 'hp-1' },
      { id: 'stu-2', hubPupilId: 'hp-2' },
    ])
  })

  it('returns the register addressed by Hub pupil id', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/services/svc-1/registrations?school_id=hub-1'))

    expect(res.status).toBe(200)
    expect(res.body.service.collectionLocation).toBe('Side gate')
    expect(res.body.registrations).toHaveLength(2)
    expect(res.body.registrations[0]).toMatchObject({ pupilId: 'hp-1', pupilName: 'Amir Khan', days: ['Monday', 'Tuesday'] })
    // Connect's internal Student id never crosses to Desk.
    expect(JSON.stringify(res.body)).not.toContain('stu-1')
  })

  // The reason the field exists: whoever hands out breakfast needs to know.
  it('carries the allergy note through to the register', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/services/svc-1/registrations?school_id=hub-1'))
    expect(res.body.registrations[0].notes).toBe('Nut allergy')
  })

  it('never exposes parent contact details', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/services/svc-1/registrations?school_id=hub-1'))
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('parentName')
    expect(body).not.toContain('parentEmail')
    expect(body).not.toContain('parentId')
  })

  it('day narrows it to one session\'s register', async () => {
    const res = await auth(request(makeApp()).get('/api/partner/services/svc-1/registrations?school_id=hub-1&day=Monday'))
    expect(res.body.registrations.map((r: { pupilId: string }) => r.pupilId)).toEqual(['hp-1'])
  })

  it('drops a Test Student from the register', async () => {
    // stu-2 comes back from a Test-excluded lookup as absent.
    prismaMock.student.findMany.mockResolvedValue([{ id: 'stu-1', hubPupilId: 'hp-1' }])
    const res = await auth(request(makeApp()).get('/api/partner/services/svc-1/registrations?school_id=hub-1'))
    expect(res.body.registrations.map((r: { pupilId: string }) => r.pupilId)).toEqual(['hp-1'])
  })

  it('excludes cancelled registrations', async () => {
    await auth(request(makeApp()).get('/api/partner/services/svc-1/registrations?school_id=hub-1'))
    expect(prismaMock.serviceRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'CANCELLED' } }) }),
    )
  })
})

describe('POST /api/partner/services/:id/registrations', () => {
  const asStaff = () =>
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'STAFF', schoolId: 'school-1', name: 'Mrs Ahmed' })

  beforeEach(() => {
    asStaff()
    prismaMock.schoolService.findFirst.mockResolvedValue(SERVICE)
    prismaMock.student.findFirst.mockResolvedValue({
      id: 'stu-1', firstName: 'Amir', lastName: 'Khan', classId: 'c-1',
      class: { name: '3A', yearGroup: { name: 'Year 3' } },
    })
    prismaMock.parentStudentLink.findFirst.mockResolvedValue({ userId: 'parent-1' })
    prismaMock.serviceRegistration.findUnique.mockResolvedValue(null)
    prismaMock.serviceRegistration.count.mockResolvedValue(0)
    prismaMock.serviceRegistration.create.mockImplementation(async ({ data }: any) => ({
      id: 'r-new', ...data, createdAt: new Date('2026-09-01'),
    }))
  })

  const post = (body: Record<string, unknown>) =>
    auth(request(makeApp()).post('/api/partner/services/svc-1/registrations').send({
      hub_user_id: 'hub-user-1', school_id: 'hub-1', pupil_id: 'hp-1', days: ['Monday'], ...body,
    }))

  it('registers the pupil and tells the parent who did it', async () => {
    const res = await post({})

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ pupilId: 'hp-1', pupilName: 'Amir Khan', status: 'PENDING' })
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'parent-1', type: 'SCHOOL_SERVICE' }),
      }),
    )
    // A place taken on a parent's behalf that they never hear about is how a
    // child turns up to a club nobody expected to pay for.
    expect(prismaMock.notification.create.mock.calls[0][0].data.body).toContain('Mrs Ahmed')
  })

  it('403 when the caller is not staff', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await post({})
    expect(res.status).toBe(403)
    expect(prismaMock.serviceRegistration.create).not.toHaveBeenCalled()
  })

  it('waitlists rather than refusing when the service is full', async () => {
    prismaMock.serviceRegistration.count.mockResolvedValue(2) // capacity is 2
    const res = await post({})
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('WAITLISTED')
  })

  // Staff registering at the door is much of the point, so the parent-facing
  // registration window does not apply — but an unfinished service still does.
  it('allows a registration outside the parent registration window', async () => {
    prismaMock.schoolService.findFirst.mockResolvedValue({ ...SERVICE, status: 'REGISTRATION_CLOSED' })
    const res = await post({})
    expect(res.status).toBe(201)
  })

  it('refuses a DRAFT service', async () => {
    prismaMock.schoolService.findFirst.mockResolvedValue({ ...SERVICE, status: 'DRAFT' })
    const res = await post({})
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('service_not_open')
  })

  it('enforces the same year-group eligibility the parent flow does', async () => {
    prismaMock.schoolService.findFirst.mockResolvedValue({ ...SERVICE, eligibleYears: '["Year 1"]' })
    const res = await post({})
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: 'pupil_not_eligible', reason: 'year_group' })
  })

  // parentId is required and is who owns the registration in the parent app.
  it('refuses a pupil with no linked guardian rather than inventing an owner', async () => {
    prismaMock.parentStudentLink.findFirst.mockResolvedValue(null)
    const res = await post({})
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('no_linked_parent')
  })

  it('409 when the pupil is already on the register', async () => {
    prismaMock.serviceRegistration.findUnique.mockResolvedValue({ id: 'r-1', status: 'PENDING' })
    const res = await post({})
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('already_registered')
  })

  it('re-registers a pupil who had cancelled', async () => {
    prismaMock.serviceRegistration.findUnique.mockResolvedValue({ id: 'r-old', status: 'CANCELLED' })
    prismaMock.serviceRegistration.update.mockResolvedValue({
      id: 'r-old', studentName: 'Amir Khan', className: '3A', days: '["Monday"]',
      status: 'PENDING', paymentStatus: 'UNPAID', notes: null, startDate: null, createdAt: new Date(),
    })
    const res = await post({})
    expect(res.status).toBe(201)
    expect(prismaMock.serviceRegistration.create).not.toHaveBeenCalled()
  })

  it('404 for a pupil this school does not have', async () => {
    prismaMock.student.findFirst.mockResolvedValue(null)
    const res = await post({})
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('pupil_not_found')
  })

  it('requires days', async () => {
    const res = await post({ days: [] })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/partner/services/registrations/:regId', () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'STAFF', schoolId: 'school-1', name: 'Mrs Ahmed' })
  })

  it('cancels rather than deletes, so the history survives', async () => {
    prismaMock.serviceRegistration.findFirst.mockResolvedValue({ id: 'r-1', status: 'PENDING' })
    prismaMock.serviceRegistration.update.mockResolvedValue({})

    const res = await auth(
      request(makeApp()).delete('/api/partner/services/registrations/r-1?hub_user_id=hub-user-1&school_id=hub-1'),
    )

    expect(res.status).toBe(200)
    expect(prismaMock.serviceRegistration.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { status: 'CANCELLED' },
    })
  })

  it('404 for a registration at another school', async () => {
    prismaMock.serviceRegistration.findFirst.mockResolvedValue(null)
    const res = await auth(
      request(makeApp()).delete('/api/partner/services/registrations/r-x?hub_user_id=hub-user-1&school_id=hub-1'),
    )
    expect(res.status).toBe(404)
  })

  it('403 when the caller is not staff', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await auth(
      request(makeApp()).delete('/api/partner/services/registrations/r-1?hub_user_id=nobody&school_id=hub-1'),
    )
    expect(res.status).toBe(403)
  })
})

// Accounts work in Desk and have no Connect login, so marking a place paid has
// to be possible from there.
describe('PATCH /api/partner/services/registrations/:regId', () => {
  const REG = {
    id: 'r-1', studentId: 'stu-1', paymentStatus: 'UNPAID', status: 'PENDING',
    service: { name: 'Early Bird Club' },
  }

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'STAFF', schoolId: 'school-1', name: 'Ms Accounts' })
    prismaMock.serviceRegistration.findFirst.mockResolvedValue(REG)
    prismaMock.student.findFirst.mockResolvedValue({ hubPupilId: 'hp-1' })
    prismaMock.auditLog.create.mockResolvedValue({})
    prismaMock.serviceRegistration.update.mockImplementation(async ({ data }: any) => ({
      id: 'r-1', studentId: 'stu-1', studentName: 'Amir Khan', className: '3A',
      days: '["Monday"]', notes: null, startDate: null, createdAt: new Date('2026-08-01'),
      status: data.status ?? 'PENDING', paymentStatus: data.paymentStatus ?? 'UNPAID',
    }))
  })

  const patch = (body: Record<string, unknown>) =>
    auth(request(makeApp()).patch('/api/partner/services/registrations/r-1').send({
      hub_user_id: 'hub-user-1', school_id: 'hub-1', ...body,
    }))

  it('marks a place paid', async () => {
    const res = await patch({ payment_status: 'PAID' })

    expect(res.status).toBe(200)
    expect(res.body.paymentStatus).toBe('PAID')
    expect(prismaMock.serviceRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: 'PAID' } }),
    )
  })

  it('confirms a registration', async () => {
    const res = await patch({ status: 'CONFIRMED' })
    expect(res.body.status).toBe('CONFIRMED')
  })

  it('takes both at once', async () => {
    const res = await patch({ payment_status: 'PAID', status: 'CONFIRMED' })
    expect(res.body).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' })
  })

  // Months later, someone will ask who marked this paid, and the person who did
  // it has no Connect session to trace back to.
  it('audits the change against the named Desk staff member', async () => {
    await patch({ payment_status: 'PAID' })

    const audit = prismaMock.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      userName: 'Ms Accounts',
      resourceType: 'SCHOOL_SERVICE',
      resourceId: 'r-1',
      schoolId: 'school-1',
    })
    expect(audit.changes).toEqual({ paymentStatus: { from: 'UNPAID', to: 'PAID' } })
    expect(audit.metadata).toMatchObject({ via: 'partner' })
  })

  it('rejects a payment status outside the allowed set', async () => {
    const res = await patch({ payment_status: 'SORT_OF' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('invalid_payment_status')
    expect(prismaMock.serviceRegistration.update).not.toHaveBeenCalled()
  })

  it('rejects a request that changes nothing', async () => {
    const res = await patch({})
    expect(res.status).toBe(400)
  })

  it('403 when the caller is not staff', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await patch({ payment_status: 'PAID' })
    expect(res.status).toBe(403)
    expect(prismaMock.serviceRegistration.update).not.toHaveBeenCalled()
  })

  it('404 for a registration at another school', async () => {
    prismaMock.serviceRegistration.findFirst.mockResolvedValue(null)
    const res = await patch({ payment_status: 'PAID' })
    expect(res.status).toBe(404)
  })

  it('still never returns parent contact details', async () => {
    const res = await patch({ payment_status: 'PAID' })
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('parentName')
    expect(body).not.toContain('parentEmail')
  })
})
