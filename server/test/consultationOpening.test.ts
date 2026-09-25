import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Telling a family that booking is open FOR THEM.
 *
 * Staggered opening was built and announced to nobody. Nothing fired when an
 * evening opened, nothing fired when a year group's wave opened, and the
 * dashboard did not mention consultations at all. So a wave rewarded whoever
 * happened to have the app open at the right minute, and the parents who most
 * need a fair shot at a slot — the ones not refreshing at six o'clock — were
 * told nothing.
 *
 * Three properties carry the whole feature, and each has a way of failing that
 * nobody would notice until it had already happened to 400 families:
 *
 *   SILENT ON DEPLOY. Every existing event has a null `bookingOpenedAt`. If
 *   this job treated that as "opened now", its first tick would push every
 *   parent in the school about an evening they may already have booked.
 *
 *   ONCE PER FAMILY, NOT PER WAVE. A family in Year 2 and Year 5 becomes able
 *   to book when the EARLIER wave opens. Telling them again when Year 5 opens
 *   is a second push about an evening they could already book — which reads as
 *   a mistake, because it is one.
 *
 *   NEVER LATE. An announcement about a wave that opened three days ago tells
 *   a parent to hurry for slots that have been going since Monday. Missing it
 *   is better, and is what the window enforces.
 */

const prismaMock = {
  consultationEvent: { findMany: vi.fn() },
  parentStudentLink: { findMany: vi.fn() },
  consultationOpenNotice: { findMany: vi.fn(), createMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const sendNotification = vi.fn(async () => undefined)
vi.mock('../src/services/notify', () => ({ sendNotification }))

const { notifyConsultationOpenings } = await import('../src/services/consultationOpening')

const NOW = new Date('2026-10-01T14:00:00.000Z')
const AN_HOUR_AGO = new Date('2026-10-01T13:00:00.000Z')
const IN_AN_HOUR = new Date('2026-10-01T15:00:00.000Z')
const LAST_WEEK = new Date('2026-09-24T14:00:00.000Z')

function event(over: Record<string, unknown> = {}) {
  return {
    id: 'ce-1',
    schoolId: 'sch-1',
    title: 'Autumn Consultations',
    date: '2026-10-14',
    bookingOpenedAt: AN_HOUR_AGO,
    bookingWindows: [],
    ...over,
  }
}

/** A parent with one child in a year group. */
function link(userId: string, yearGroupId: string | null) {
  return { userId, student: { class: { yearGroupId } } }
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.consultationOpenNotice.findMany.mockResolvedValue([])
  prismaMock.consultationOpenNotice.createMany.mockResolvedValue({ count: 0 })
  prismaMock.consultationEvent.findMany.mockResolvedValue([])
  prismaMock.parentStudentLink.findMany.mockResolvedValue([])
})

/** The parent ids a single send went to. */
function toldIds(): string[] {
  expect(sendNotification).toHaveBeenCalledTimes(1)
  return sendNotification.mock.calls[0][0].target.parentUserIds
}

describe('an evening with no waves', () => {
  it('tells every family when it opens', async () => {
    prismaMock.consultationEvent.findMany.mockResolvedValue([event()])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('p-1', 'yg-2'), link('p-2', 'yg-5'),
    ])

    const s = await notifyConsultationOpenings(NOW)

    expect(toldIds().sort()).toEqual(['p-1', 'p-2'])
    expect(s.notified).toBe(2)
  })

  it('says nothing about an event that opened last week', async () => {
    // Not "tell them late". An announcement about a race already run sends a
    // parent hurrying for slots that have been going for days.
    prismaMock.consultationEvent.findMany.mockResolvedValue([event({ bookingOpenedAt: LAST_WEEK })])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'yg-2')])

    await notifyConsultationOpenings(NOW)

    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('SAYS NOTHING about an event that predates the column — the deploy guard', async () => {
    // THE ONE THAT MATTERS ON THE DAY THIS SHIPS. Every existing event has a
    // null bookingOpenedAt. Reading that as "opened now" would push every
    // parent in the school on the first tick after deploy.
    prismaMock.consultationEvent.findMany.mockResolvedValue([event({ bookingOpenedAt: null })])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'yg-2'), link('p-2', 'yg-5')])

    const s = await notifyConsultationOpenings(NOW)

    expect(sendNotification).not.toHaveBeenCalled()
    expect(s.notified).toBe(0)
  })
})

describe('waves', () => {
  it('tells only the year group whose wave has opened', async () => {
    prismaMock.consultationEvent.findMany.mockResolvedValue([
      event({
        bookingOpenedAt: AN_HOUR_AGO,
        bookingWindows: [
          { yearGroupId: 'yg-2', opensAt: AN_HOUR_AGO },
          { yearGroupId: 'yg-5', opensAt: IN_AN_HOUR },
        ],
      }),
    ])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('p-early', 'yg-2'), link('p-later', 'yg-5'),
    ])

    await notifyConsultationOpenings(NOW)

    expect(toldIds()).toEqual(['p-early'])
  })

  it('tells a sibling family ONCE, at their earliest wave', async () => {
    // Year 2 and Year 5. They can book everything from the Year 2 time — the
    // same rule the booking gate applies — so the Year 5 wave opening later is
    // not news to them.
    prismaMock.consultationEvent.findMany.mockResolvedValue([
      event({
        bookingWindows: [
          { yearGroupId: 'yg-2', opensAt: AN_HOUR_AGO },
          { yearGroupId: 'yg-5', opensAt: IN_AN_HOUR },
        ],
      }),
    ])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('p-sibs', 'yg-2'), link('p-sibs', 'yg-5'),
    ])

    await notifyConsultationOpenings(NOW)

    expect(toldIds()).toEqual(['p-sibs'])
  })

  it('does not tell the same family twice across ticks', async () => {
    prismaMock.consultationEvent.findMany.mockResolvedValue([event()])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'yg-2')])
    prismaMock.consultationOpenNotice.findMany.mockResolvedValue([{ userId: 'p-1' }])

    const s = await notifyConsultationOpenings(NOW)

    expect(sendNotification).not.toHaveBeenCalled()
    expect(s.alreadyTold).toBe(1)
  })

  it('a year group with no wave opens with the event, not never', async () => {
    // Waves narrow within the event being open; a year group nobody gave a
    // time to can book immediately. Silence here would strand them.
    prismaMock.consultationEvent.findMany.mockResolvedValue([
      event({ bookingWindows: [{ yearGroupId: 'yg-2', opensAt: IN_AN_HOUR }] }),
    ])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      link('p-waiting', 'yg-2'), link('p-nowave', 'yg-6'),
    ])

    await notifyConsultationOpenings(NOW)

    expect(toldIds()).toEqual(['p-nowave'])
  })
})

describe('the ledger', () => {
  it('records everyone it told, keyed to the event', async () => {
    prismaMock.consultationEvent.findMany.mockResolvedValue([event()])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'yg-2'), link('p-2', 'yg-5')])

    await notifyConsultationOpenings(NOW)

    const arg = prismaMock.consultationOpenNotice.createMany.mock.calls[0][0]
    expect(arg.data).toEqual([
      { consultationId: 'ce-1', userId: 'p-1' },
      { consultationId: 'ce-1', userId: 'p-2' },
    ])
    // Two replicas ticking at once must not collide into a 500.
    expect(arg.skipDuplicates).toBe(true)
  })

  it('records AFTER sending, so a failed push is retried rather than lost', async () => {
    const order: string[] = []
    sendNotification.mockImplementation(async () => { order.push('send') })
    prismaMock.consultationOpenNotice.createMany.mockImplementation(async () => {
      order.push('record'); return { count: 1 }
    })
    prismaMock.consultationEvent.findMany.mockResolvedValue([event()])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'yg-2')])

    await notifyConsultationOpenings(NOW)

    expect(order).toEqual(['send', 'record'])
  })

  it('reaches parents as a resolved audience, never a whole-school blast', async () => {
    prismaMock.consultationEvent.findMany.mockResolvedValue([event()])
    prismaMock.parentStudentLink.findMany.mockResolvedValue([link('p-1', 'yg-2')])

    await notifyConsultationOpenings(NOW)

    const target = sendNotification.mock.calls[0][0].target
    expect(target.parentUserIds).toEqual(['p-1'])
    expect(target.schoolId).toBe('sch-1')
    // CONSULTATION maps to the `consultations` preference, so a parent who has
    // turned these off stays off.
    expect(sendNotification.mock.calls[0][0].type).toBe('CONSULTATION')
  })
})
