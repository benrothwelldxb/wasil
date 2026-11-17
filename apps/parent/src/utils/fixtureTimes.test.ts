import { describe, it, expect } from 'vitest'
import { fixtureTimeLines } from './fixtureTimes'

const fixture = (over: Record<string, unknown>) =>
  ({ kind: 'fixture', name: 'Aquathlon v Jebel Ali School', status: 'scheduled', starts_at: '08:38', ...over }) as any

describe('fixture times on This Week', () => {
  it('shows kick-off alongside the leave time, which it used to drop', () => {
    expect(fixtureTimeLines(fixture({ departs_at: '07:53' }))).toEqual(['Leaves 07:53 · starts 08:38'])
  })

  it('adds when they are back at school', () => {
    expect(fixtureTimeLines(fixture({ starts_at: '17:00', departs_at: '15:30', returns_at: '18:20' })))
      .toEqual(['Leaves 15:30 · starts 17:00 · back at school 18:20'])
  })

  it('says to collect from the venue instead of a return, never both', () => {
    expect(fixtureTimeLines(fixture({ starts_at: '15:00', departs_at: '14:05', returns_at: '16:00', collect_at: '16:00' })))
      .toEqual(['Leaves 14:05 · starts 15:00', 'Collect from the venue at 16:00'])
  })

  it('a home fixture with no leave time just starts', () => {
    expect(fixtureTimeLines(fixture({ starts_at: '15:30' }))).toEqual(['Starts 15:30'])
  })

  it('leaves club times as they were', () => {
    expect(fixtureTimeLines({ kind: 'club', name: 'Swim Squad', status: 'scheduled', starts_at: '15:15', ends_at: '16:15' } as any))
      .toEqual(['15:15–16:15'])
  })
})

describe('fixture details from Active', () => {
  it('puts the meet time first', () => {
    expect(fixtureTimeLines(fixture({ meet_at: '14:00', departs_at: '14:05', starts_at: '15:00', collect_at: '16:00' })))
      .toEqual(['Meet 14:00 · leaves 14:05 · starts 15:00', 'Collect from the venue at 16:00'])
  })

  it('lists squad, kit and transport, only when set', async () => {
    const { fixtureDetailRows } = await import('./fixtureTimes')
    expect(fixtureDetailRows(fixture({ role: 'substitute', kit: 'Burgundy Polo', transport: null }))).toEqual([
      { label: 'Squad', value: 'Substitute' },
      { label: 'Kit', value: 'Burgundy Polo' },
    ])
    expect(fixtureDetailRows(fixture({}))).toEqual([])
    expect(fixtureDetailRows({ kind: 'club', name: 'Swim', status: 'scheduled', starts_at: '15:15', kit: 'x' } as any)).toEqual([])
  })
})
