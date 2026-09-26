import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

/**
 * Pressing "Nudge them".
 *
 * The cooldown is the part worth testing, and not because double-sending is
 * untidy. A school presses the button, the number does not move, and presses
 * it again — and the second press is the one that sends a family two
 * notifications in a minute, which is how a parent turns notifications off for
 * good. So anyone chased in the last day is skipped, and the response SAYS how
 * many, because a button that appears to have done nothing gets pressed again.
 */

const prismaMock = {
  consultationEvent: { findFirst: vi.fn() },
  consultationNudge: { upsert: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const unbookedFamilies = vi.fn()
vi.mock('../src/services/consultationUnbooked', () => ({ unbookedFamilies }))
const sendNotification = vi.fn(async () => undefined)
vi.mock('../src/services/notify', () => ({ sendNotification }))
const sendConsultationNudgeToParent = vi.fn(async () => undefined)
vi.mock('../src/services/consultationEmails', () => ({
  sendBookingConfirmationToParent: vi.fn(async () => undefined),
  sendBookingNotificationToTeacher: vi.fn(async () => undefined),
  sendCancellationToParent: vi.fn(async () => undefined),
  sendCancellationToTeacher: vi.fn(async () => undefined),
  sendConsultationNudgeToParent,
}))
vi.mock('../src/services/consultationNotify', () => ({
  sendConsultationBookingNotification: vi.fn(async () => undefined),
  sendConsultationCancellationNotification: vi.fn(async () => undefined),
  sendSchoolCancellationNotification: vi.fn(async () => undefined),
}))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(async () => undefined), computeChanges: vi.fn(() => null) }))
vi.mock('../src/services/googleMeet', () => ({
  getGoogleAuthUrl: vi.fn(), exchangeGoogleCode: vi.fn(),
  createGoogleMeetEvent: vi.fn(async () => undefined),
  deleteGoogleMeetEvent: vi.fn(async () => undefined),
  isGoogleCalendarConfigured: vi.fn(() => false),
  GOOGLE_CALENDAR_REDIRECT_URI: 'https://x.test/cb',
}))
vi.mock('../src/middleware/auth', () => {
  const asAdmin = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    ;(req as express.Request & { user?: unknown }).user = { id: 'admin-1', schoolId: 'sch-1', role: 'ADMIN', name: 'Office' }
    next()
  }
  return { isAuthenticated: asAdmin, isAdmin: asAdmin, isStaff: asAdmin, loadUserWithRelations: vi.fn() }
})

const { default: consultationRoutes } = await import('../src/routes/consultations')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/consultations', consultationRoutes)
  return app
}

const nudge = () => request(makeApp()).post('/api/consultations/ce-1/nudge').send({})

function family(parentId: string, lastNudgedAt: Date | null) {
  return {
    parentId,
    parentName: `Parent ${parentId}`,
    parentEmail: `${parentId}@x.com`,
    childrenWithout: ['Amina'],
    bookedCount: 0,
    lastNudgedAt,
    nudgeCount: lastNudgedAt ? 1 : 0,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.consultationEvent.findFirst.mockResolvedValue({
    id: 'ce-1', title: 'Autumn Consultations', date: '2026-10-09',
    status: 'BOOKING_OPEN', school: { name: 'VHPS' },
  })
  prismaMock.consultationNudge.upsert.mockResolvedValue({})
  unbookedFamilies.mockResolvedValue({ families: [], childrenWithout: [], childrenEligible: 0, childrenWaiting: 0 })
})

describe('nudging', () => {
  it('reaches them by app notification AND email', async () => {
    // Push alone would miss the families without the app — who are
    // disproportionately the families that have not booked.
    unbookedFamilies.mockResolvedValue({ families: [family('p-1', null)], childrenWithout: new Array(10).fill({}), childrenEligible: 10, childrenWaiting: 0 })

    const res = await nudge()

    expect(res.body).toMatchObject({ nudged: 1, skipped: 0 })
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ parentUserIds: ['p-1'] }) }),
    )
    expect(sendConsultationNudgeToParent).toHaveBeenCalledWith(
      'p-1@x.com',
      expect.objectContaining({ childrenWithout: ['Amina'] }),
    )
  })

  it('records the chase, incrementing rather than overwriting', async () => {
    unbookedFamilies.mockResolvedValue({ families: [family('p-1', null)], childrenWithout: new Array(1).fill({}), childrenEligible: 1, childrenWaiting: 0 })

    await nudge()

    const arg = prismaMock.consultationNudge.upsert.mock.calls[0][0]
    expect(arg.where).toEqual({ consultationId_userId: { consultationId: 'ce-1', userId: 'p-1' } })
    expect(arg.update.count).toEqual({ increment: 1 })
  })
})

describe('the cooldown', () => {
  it('skips a family chased an hour ago, and SAYS SO', async () => {
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    unbookedFamilies.mockResolvedValue({ families: [family('p-fresh', null), family('p-chased', anHourAgo)], childrenWithout: new Array(5).fill({}), childrenEligible: 5, childrenWaiting: 0 })

    const res = await nudge()

    expect(res.body).toMatchObject({ nudged: 1, skipped: 1 })
    expect(sendNotification.mock.calls[0][0].target.parentUserIds).toEqual(['p-fresh'])
  })

  it('chases again once a day has passed', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    unbookedFamilies.mockResolvedValue({ families: [family('p-old', twoDaysAgo)], childrenWithout: new Array(1).fill({}), childrenEligible: 1, childrenWaiting: 0 })

    const res = await nudge()

    expect(res.body.nudged).toBe(1)
  })

  it('sends nothing at all when everyone is on cooldown', async () => {
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    unbookedFamilies.mockResolvedValue({ families: [family('p-1', anHourAgo)], childrenWithout: new Array(3).fill({}), childrenEligible: 3, childrenWaiting: 0 })

    const res = await nudge()

    expect(res.body).toMatchObject({ nudged: 0, skipped: 1 })
    expect(sendNotification).not.toHaveBeenCalled()
    expect(prismaMock.consultationNudge.upsert).not.toHaveBeenCalled()
  })
})

describe('what it refuses', () => {
  it('refuses when booking is not open — there is nothing for a parent to do', async () => {
    prismaMock.consultationEvent.findFirst.mockResolvedValue({
      id: 'ce-1', title: 'x', date: '2026-10-09', status: 'PUBLISHED', school: { name: 'VHPS' },
    })

    const res = await nudge()

    expect(res.status).toBe(400)
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('404s a consultation at another school', async () => {
    prismaMock.consultationEvent.findFirst.mockResolvedValue(null)
    expect((await nudge()).status).toBe(404)
  })
})
