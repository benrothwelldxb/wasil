import { describe, it, expect } from 'vitest'
import { currentStaffWhere, hasLeft } from '../src/services/currentStaff'

/**
 * "Has a leaving date" and "has left" are different questions, and the gap
 * between them is months.
 *
 * Hub sets `leftOn` when notice is given, not when the person walks out: a
 * teacher resigning in March for a July leaving date carries a July date from
 * March. Filtering staff on `leftAt: null` — the obvious reading, and the one
 * this codebase shipped first — removes that teacher from every picker while
 * they are still teaching the class.
 *
 * That failure is worse than the one it replaced. Leavers in a picker is
 * visible: you see a name you know has gone. A teacher missing from a picker
 * while they are standing in the staffroom looks like a search that didn't
 * match, and nobody files a bug about it.
 */

const NOW = new Date('2026-09-23T10:00:00.000Z')

describe('hasLeft', () => {
  it('is false with no date at all', () => {
    expect(hasLeft({ leftAt: null }, NOW)).toBe(false)
    expect(hasLeft({}, NOW)).toBe(false)
  })

  it('is false for a leaving date still to come', () => {
    expect(hasLeft({ leftAt: new Date('2027-07-15T00:00:00.000Z') }, NOW)).toBe(false)
  })

  it('is true once the date has passed', () => {
    expect(hasLeft({ leftAt: new Date('2026-07-10T00:00:00.000Z') }, NOW)).toBe(true)
  })

  it('THE LEAVING DATE IS THE LAST WORKING DAY — still here all of it', () => {
    // The bug this replaced: `leftAt <= now` excluded somebody at 00:01 on a
    // morning they were still teaching. Hub deactivates on a date strictly in
    // the past for exactly this reason, and so does Loop.
    const lastDay = new Date('2026-09-23T00:00:00.000Z')
    expect(hasLeft({ leftAt: lastDay }, new Date('2026-09-23T00:01:00.000Z'))).toBe(false)
    expect(hasLeft({ leftAt: lastDay }, new Date('2026-09-23T23:59:00.000Z'))).toBe(false)
    // And gone the next morning.
    expect(hasLeft({ leftAt: lastDay }, new Date('2026-09-24T00:00:00.000Z'))).toBe(true)
  })

  it('errs towards access rather than lockout', () => {
    // Which way to be wrong, stated as a test. A leaver lingering a day is
    // visible — somebody sees a name they know has gone. A teacher locked out
    // on their last day reads it as a broken login and files nothing.
    const lastDay = new Date('2026-09-23T00:00:00.000Z')
    expect(hasLeft({ leftAt: lastDay }, new Date('2026-09-23T12:00:00.000Z'))).toBe(false)
  })
})

describe('a summary dismissal', () => {
  // DIFFERENT FROM A LEAVING DATE, and Hub reports it differently: a revoked
  // login arrives with leftOn NULL and isArchived FALSE, so every other signal
  // says the person is still current. Without this they would stay in Connect
  // for ever while Hub had already ended their access.
  it('is effective immediately — no date, no grace', () => {
    // The reassurance a summary dismissal exists to provide. Reusing the
    // leaving-date rule would give them the rest of the day.
    const justNow = new Date('2026-09-23T09:15:00.000Z')
    expect(hasLeft({ accessRevokedAt: justNow }, new Date('2026-09-23T09:16:00.000Z'))).toBe(true)
  })

  it('overrides a leaving date still in the future', () => {
    // Somebody serving notice who is then dismissed. The notice period does
    // not survive the dismissal.
    expect(hasLeft(
      { leftAt: new Date('2027-07-15T00:00:00.000Z'), accessRevokedAt: new Date('2026-09-23T09:15:00.000Z') },
      NOW,
    )).toBe(true)
  })

  it('is not implied by the absence of a leaving date', () => {
    expect(hasLeft({ leftAt: null, accessRevokedAt: null }, NOW)).toBe(false)
  })
})

describe('currentStaffWhere', () => {
  it('matches no date, or one that has not passed — measured from the start of today', () => {
    // `gte` the start of today, not `gt` the current instant. The second form
    // is what cut a day early.
    expect(currentStaffWhere(NOW)).toEqual({
      accessRevokedAt: null,
      OR: [{ leftAt: null }, { leftAt: { gte: new Date('2026-09-23T00:00:00.000Z') } }],
    })
  })

  it('spreads into a where clause without disturbing the rest of it', () => {
    const where = { schoolId: 'sch-1', role: { in: ['STAFF'] }, ...currentStaffWhere(NOW) }
    expect(where.schoolId).toBe('sch-1')
    expect(where.accessRevokedAt).toBeNull()
    expect(where.role).toEqual({ in: ['STAFF'] })
    expect(where.OR).toHaveLength(2)
  })

  it('reads the clock at call time, not at import time', () => {
    // A long-lived process would otherwise pin "today" to boot, and a teacher
    // whose last day passed mid-term would stay pickable until a redeploy.
    const a = currentStaffWhere(new Date('2026-09-23T12:00:00.000Z'))
    const b = currentStaffWhere(new Date('2026-09-24T12:00:00.000Z'))
    expect((b.OR[1].leftAt as { gte: Date }).gte.getTime()).toBeGreaterThan(
      (a.OR[1].leftAt as { gte: Date }).gte.getTime(),
    )
  })
})
