import { describe, it, expect } from 'vitest'
import {
  computeDraw,
  validateDraw,
  DrawError,
  type DrawParticipant,
  type DrawExclusionPair,
} from './draw'

function people(n: number): DrawParticipant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }))
}

function expectValid(
  parts: DrawParticipant[],
  pairs: { giver_id: string; receiver_id: string }[],
  exclusions: DrawExclusionPair[] = [],
) {
  const { valid, errors } = validateDraw(parts, pairs, exclusions)
  expect(errors).toEqual([])
  expect(valid).toBe(true)
}

describe('computeDraw — sizes', () => {
  for (const n of [3, 10, 50, 100]) {
    it(`produces a valid derangement for ${n} people`, () => {
      const parts = people(n)
      const res = computeDraw(parts, [], { seed: 1234 })
      expect(res.pairs).toHaveLength(n)
      expectValid(parts, res.pairs)
      // No self-assignments
      for (const p of res.pairs) expect(p.giver_id).not.toBe(p.receiver_id)
      // With no exclusions and n >= 3 the single-cycle method gives zero reciprocals
      expect(res.reciprocalCount).toBe(0)
      expect(res.method).toBe('cycle')
    })
  }

  it('handles the minimal 2-person group (reciprocal unavoidable)', () => {
    const parts = people(2)
    const res = computeDraw(parts, [], { seed: 7 })
    expectValid(parts, res.pairs)
    expect(res.reciprocalCount).toBe(1)
  })

  it('rejects groups that are too small', () => {
    expect(() => computeDraw(people(1))).toThrow(DrawError)
    expect(() => computeDraw(people(0))).toThrow(/at least two/)
  })

  it('rejects duplicate ids', () => {
    expect(() =>
      computeDraw([{ id: 'a' }, { id: 'a' }, { id: 'b' }]),
    ).toThrow(/unique/)
  })
})

describe('computeDraw — exclusions', () => {
  it('respects a handful of exclusions', () => {
    const parts = people(10)
    const exclusions: DrawExclusionPair[] = [
      { giver_id: 'p1', receiver_id: 'p2' },
      { giver_id: 'p2', receiver_id: 'p1' },
      { giver_id: 'p3', receiver_id: 'p4' },
      { giver_id: 'p5', receiver_id: 'p6' },
    ]
    const res = computeDraw(parts, exclusions, { seed: 99 })
    expectValid(parts, res.pairs, exclusions)
  })

  it('respects dense exclusions that force the matching fallback', () => {
    // Forbid every giver from ~half of all receivers.
    const parts = people(12)
    const exclusions: DrawExclusionPair[] = []
    for (let i = 1; i <= 12; i++) {
      for (let j = 1; j <= 12; j++) {
        if (i !== j && (i + j) % 2 === 0) {
          exclusions.push({ giver_id: `p${i}`, receiver_id: `p${j}` })
        }
      }
    }
    const res = computeDraw(parts, exclusions, { seed: 3, maxCycleAttempts: 5 })
    expectValid(parts, res.pairs, exclusions)
  })

  it('models "exclude last year" by forbidding previous pairs', () => {
    const parts = people(8)
    // Last year's assignment was a simple chain p1->p2->...->p8->p1
    const lastYear: DrawExclusionPair[] = parts.map((p, i) => ({
      giver_id: p.id,
      receiver_id: parts[(i + 1) % parts.length]!.id,
    }))
    const res = computeDraw(parts, lastYear, { seed: 42 })
    expectValid(parts, res.pairs, lastYear)
    // Nobody repeats last year's pairing
    const last = new Set(lastYear.map((e) => `${e.giver_id}->${e.receiver_id}`))
    for (const p of res.pairs) {
      expect(last.has(`${p.giver_id}->${p.receiver_id}`)).toBe(false)
    }
  })
})

describe('computeDraw — impossible constraints', () => {
  it('throws INFEASIBLE when a person is excluded from everyone', () => {
    const parts = people(4)
    const exclusions: DrawExclusionPair[] = parts
      .filter((p) => p.id !== 'p1')
      .map((p) => ({ giver_id: 'p1', receiver_id: p.id }))
    // p1 can only be given to themselves → impossible
    expect(() => computeDraw(parts, exclusions, { seed: 1 })).toThrow(DrawError)
    try {
      computeDraw(parts, exclusions, { seed: 1 })
    } catch (e) {
      expect((e as DrawError).code).toBe('INFEASIBLE')
    }
  })

  it('throws INFEASIBLE when everyone is forbidden from one receiver', () => {
    // Nobody may give to p1 → p1 cannot receive → impossible
    const parts = people(5)
    const exclusions: DrawExclusionPair[] = parts.map((p) => ({
      giver_id: p.id,
      receiver_id: 'p1',
    }))
    expect(() => computeDraw(parts, exclusions, { seed: 2 })).toThrow(/no valid draw/i)
  })
})

describe('computeDraw — determinism & idempotency', () => {
  it('is deterministic: same seed ⇒ identical draw', () => {
    const parts = people(30)
    const a = computeDraw(parts, [], { seed: 555 })
    const b = computeDraw(parts, [], { seed: 555 })
    expect(a.pairs).toEqual(b.pairs)
  })

  it('re-running never silently produces a different draw for the same seed', () => {
    const parts = people(20)
    const exclusions: DrawExclusionPair[] = [
      { giver_id: 'p1', receiver_id: 'p2' },
      { giver_id: 'p10', receiver_id: 'p11' },
    ]
    const runs = Array.from({ length: 5 }, () =>
      computeDraw(parts, exclusions, { seed: 2026 }),
    )
    for (const r of runs) expect(r.pairs).toEqual(runs[0]!.pairs)
  })

  it('different seeds generally produce different draws', () => {
    const parts = people(25)
    const a = computeDraw(parts, [], { seed: 1 })
    const b = computeDraw(parts, [], { seed: 2 })
    expect(a.pairs).not.toEqual(b.pairs)
  })
})

describe('computeDraw — reciprocal avoidance', () => {
  it('produces zero reciprocals for a typical group', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const res = computeDraw(people(15), [], { seed })
      expect(res.reciprocalCount).toBe(0)
    }
  })

  it('keeps reciprocals low even under the matching fallback', () => {
    const parts = people(20)
    const exclusions: DrawExclusionPair[] = []
    for (let i = 1; i <= 20; i++) {
      // forbid the "natural" next neighbour to disrupt easy cycles
      exclusions.push({ giver_id: `p${i}`, receiver_id: `p${(i % 20) + 1}` })
    }
    const res = computeDraw(parts, exclusions, { seed: 8, maxCycleAttempts: 3 })
    expectValid(parts, res.pairs, exclusions)
    // Should be able to keep reciprocals modest (<= a small fraction)
    expect(res.reciprocalCount).toBeLessThanOrEqual(3)
  })
})

describe('validateDraw', () => {
  it('flags self-assignment', () => {
    const parts = people(3)
    const bad = [
      { giver_id: 'p1', receiver_id: 'p1' },
      { giver_id: 'p2', receiver_id: 'p3' },
      { giver_id: 'p3', receiver_id: 'p2' },
    ]
    const { valid, errors } = validateDraw(parts, bad)
    expect(valid).toBe(false)
    expect(errors.join(' ')).toMatch(/themselves/)
  })

  it('flags a receiver getting two givers', () => {
    const parts = people(3)
    const bad = [
      { giver_id: 'p1', receiver_id: 'p3' },
      { giver_id: 'p2', receiver_id: 'p3' },
      { giver_id: 'p3', receiver_id: 'p1' },
    ]
    const { valid } = validateDraw(parts, bad)
    expect(valid).toBe(false)
  })
})
