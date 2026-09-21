import { describe, it, expect } from 'vitest'
import { proximityOf, proximityMessage, type ExistingAppointment } from './slotProximity'

/**
 * Judging a slot against the appointments a family already holds.
 *
 * A parent with two children wants them close together, not two hours apart.
 * The rule the school set: at least ten minutes to get between rooms, ideally
 * no more than thirty minutes of waiting.
 *
 * Worth testing because every failure here is quiet. Off-by-one on a gap, or
 * the wrong verdict winning when a slot sits beside two appointments, produces
 * confident advice that is wrong — and a parent following it arrives late or
 * waits an hour, having been told the slot was fine.
 */

const at = (startTime: string, endTime: string, label = 'Raees with Ms Khan'): ExistingAppointment =>
  ({ startTime, endTime, label })

describe('proximityOf', () => {
  it('says nothing when the family holds no other appointments', () => {
    expect(proximityOf({ startTime: '15:30', endTime: '15:40' }, [])).toEqual({ kind: 'none' })
  })

  it('calls a twenty-minute gap ideal', () => {
    const p = proximityOf({ startTime: '16:00', endTime: '16:10' }, [at('15:30', '15:40')])
    expect(p).toMatchObject({ kind: 'ideal', gap: 20 })
  })

  it('counts the gap from the END of one to the START of the next', () => {
    // 15:40 ends, 15:55 starts — fifteen minutes, not twenty-five from start.
    const p = proximityOf({ startTime: '15:55', endTime: '16:05' }, [at('15:30', '15:40')])
    expect(p).toMatchObject({ kind: 'ideal', gap: 15 })
  })

  it('works in both directions — the new slot may come first', () => {
    const p = proximityOf({ startTime: '15:00', endTime: '15:10' }, [at('15:30', '15:40')])
    expect(p).toMatchObject({ kind: 'ideal', gap: 20 })
  })

  // The boundaries the school set, checked exactly.
  it('treats exactly ten minutes as acceptable', () => {
    expect(proximityOf({ startTime: '15:50', endTime: '16:00' }, [at('15:30', '15:40')]))
      .toMatchObject({ kind: 'ideal', gap: 10 })
  })

  it('treats nine minutes as too tight', () => {
    expect(proximityOf({ startTime: '15:49', endTime: '15:59' }, [at('15:30', '15:40')]))
      .toMatchObject({ kind: 'tight', gap: 9 })
  })

  it('treats exactly thirty minutes as still ideal', () => {
    expect(proximityOf({ startTime: '16:10', endTime: '16:20' }, [at('15:30', '15:40')]))
      .toMatchObject({ kind: 'ideal', gap: 30 })
  })

  it('treats thirty-one minutes as a long wait', () => {
    expect(proximityOf({ startTime: '16:11', endTime: '16:21' }, [at('15:30', '15:40')]))
      .toMatchObject({ kind: 'far', gap: 31 })
  })

  // Back-to-back is not a win: it means walking between two rooms with no gap.
  it('calls back-to-back too tight rather than perfect', () => {
    expect(proximityOf({ startTime: '15:40', endTime: '15:50' }, [at('15:30', '15:40')]))
      .toMatchObject({ kind: 'tight', gap: 0 })
  })

  it('calls an overlap a clash — they cannot attend both', () => {
    expect(proximityOf({ startTime: '15:35', endTime: '15:45' }, [at('15:30', '15:40')]))
      .toMatchObject({ kind: 'clash' })
  })

  it('calls an identical time a clash', () => {
    expect(proximityOf({ startTime: '15:30', endTime: '15:40' }, [at('15:30', '15:40')]))
      .toMatchObject({ kind: 'clash' })
  })

  // The precedence rule. A slot that sits beautifully beside one appointment
  // and clashes with another is a clash: they cannot attend the one it fits.
  it('reports the WORST verdict across several appointments', () => {
    const p = proximityOf({ startTime: '16:00', endTime: '16:10' }, [
      at('15:30', '15:40', 'Raees with Ms Khan'), // ideal, 20 min
      at('16:05', '16:15', 'Rameez with Mr Idris'), // clash
    ])
    expect(p.kind).toBe('clash')
  })

  it('prefers tight over far when both apply', () => {
    const p = proximityOf({ startTime: '15:45', endTime: '15:55' }, [
      at('15:30', '15:40'), // 5 min — tight
      at('18:00', '18:10'), // hours — far
    ])
    expect(p.kind).toBe('tight')
  })

  // A multi-day evening: Monday's appointment does not constrain Tuesday's.
  it('ignores an appointment on another day', () => {
    const p = proximityOf(
      { startTime: '15:35', endTime: '15:45', date: '2026-10-02' },
      [{ ...at('15:30', '15:40'), date: '2026-10-01' }],
    )
    expect(p).toEqual({ kind: 'none' })
  })

  it('still compares when neither side carries a date', () => {
    const p = proximityOf({ startTime: '15:35', endTime: '15:45' }, [at('15:30', '15:40')])
    expect(p.kind).toBe('clash')
  })

  it('ignores an unparseable time rather than guessing at it', () => {
    expect(proximityOf({ startTime: 'half three', endTime: '15:40' }, [at('15:30', '15:40')]))
      .toEqual({ kind: 'none' })
  })
})

describe('proximityMessage', () => {
  it('says nothing when there is nothing to say', () => {
    expect(proximityMessage({ kind: 'none' })).toBeNull()
  })

  it('names the clash plainly', () => {
    const msg = proximityMessage({ kind: 'clash', withLabel: 'Raees with Ms Khan' })
    expect(msg).toContain("can't attend both")
    expect(msg).toContain('Raees with Ms Khan')
  })

  it('distinguishes back-to-back from merely tight', () => {
    expect(proximityMessage({ kind: 'tight', gap: 0, withLabel: 'X' })).toContain('straight into')
    expect(proximityMessage({ kind: 'tight', gap: 5, withLabel: 'X' })).toContain('5 minutes')
  })

  it('offers the good case as reassurance rather than a warning', () => {
    expect(proximityMessage({ kind: 'ideal', gap: 20, withLabel: 'X' })).toContain('20 minutes after')
  })
})
