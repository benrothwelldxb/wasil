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
    expect(hasLeft(null, NOW)).toBe(false)
    expect(hasLeft(undefined, NOW)).toBe(false)
  })

  it('is false for a leaving date still to come', () => {
    expect(hasLeft(new Date('2027-07-15T00:00:00.000Z'), NOW)).toBe(false)
  })

  it('is true once the date has passed', () => {
    expect(hasLeft(new Date('2026-07-10T00:00:00.000Z'), NOW)).toBe(true)
  })

  it('treats the exact moment as gone', () => {
    // A boundary that has to fall one way. "Left on the 10th" reading as still
    // here at midnight on the 10th is the stranger of the two.
    expect(hasLeft(NOW, NOW)).toBe(true)
  })
})

describe('currentStaffWhere', () => {
  it('matches no date or a date in the future, and nothing else', () => {
    expect(currentStaffWhere(NOW)).toEqual({
      OR: [{ leftAt: null }, { leftAt: { gt: NOW } }],
    })
  })

  it('spreads into a where clause without disturbing the rest of it', () => {
    const where = { schoolId: 'sch-1', role: { in: ['STAFF'] }, ...currentStaffWhere(NOW) }
    expect(where.schoolId).toBe('sch-1')
    expect(where.role).toEqual({ in: ['STAFF'] })
    expect(where.OR).toHaveLength(2)
  })

  it('reads the clock at call time, not at import time', () => {
    // A long-lived process would otherwise pin "now" to boot, and a teacher
    // whose last day arrived mid-term would stay pickable until a redeploy.
    const a = currentStaffWhere()
    const b = currentStaffWhere(new Date(Date.now() + 60_000))
    expect((b.OR[1].leftAt as { gt: Date }).gt.getTime()).toBeGreaterThan(
      (a.OR[1].leftAt as { gt: Date }).gt.getTime(),
    )
  })
})
