import { describe, it, expect, vi, beforeEach } from 'vitest'

// Eligibility streaming (Hub "Shown to" tagging). Connect reads the CLASS view,
// which carries every stream, so a tagged slot holds BOTH the restricted lesson
// and the alternative. These tests pin the per-slot rule Hub documents — and in
// particular that it is FAIL-CLOSED: an unknown flag never reveals a restricted
// lesson.

const prismaMock = { user: { findUnique: vi.fn() } }
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const hubMock = { getGuardianDay: vi.fn() }
vi.mock('../src/services/hubMis', () => hubMock)

const {
  resolveBlocksForPupil,
  hasStreamedBlocks,
  eligibilityForPupil,
  guardianKeyFor,
  invalidateEligibility,
} = await import('../src/services/timetableEligibility')

type Block = { start: string; end: string; label: string; audience?: string | null }
const block = (start: string, label: string, audience: string | null = null): Block => ({
  start,
  end: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`,
  label,
  audience,
})
const labels = (blocks: Array<{ label: string }>) => blocks.map(b => b.label)

// The worked example from Hub's handoff.
const DAY = [
  block('08:00', 'Maths'),
  block('09:00', 'Arabic A', 'ARABIC_A'),
  block('09:00', 'Enrichment'),
  block('10:00', 'Islamic', 'ISLAMIC'),
  block('10:00', 'Enrichment'),
  block('11:00', 'Arabic A&B'),
] as any

beforeEach(() => {
  vi.clearAllMocks()
  invalidateEligibility()
})

describe('resolveBlocksForPupil', () => {
  it('a Muslim, Arabic-A child gets both restricted lessons', () => {
    expect(labels(resolveBlocksForPupil(DAY, { arabicA: true, muslim: true }))).toEqual([
      'Maths', 'Arabic A', 'Islamic', 'Arabic A&B',
    ])
  })

  it('a non-Muslim, non-Arabic-A child gets the alternative in both slots', () => {
    expect(labels(resolveBlocksForPupil(DAY, { arabicA: false, muslim: false }))).toEqual([
      'Maths', 'Enrichment', 'Enrichment', 'Arabic A&B',
    ])
  })

  it('resolves each slot independently (Arabic A but not Muslim)', () => {
    expect(labels(resolveBlocksForPupil(DAY, { arabicA: true, muslim: false }))).toEqual([
      'Maths', 'Arabic A', 'Enrichment', 'Arabic A&B',
    ])
  })

  it('is fail-closed: unknown flags never reveal a restricted lesson', () => {
    expect(labels(resolveBlocksForPupil(DAY, {}))).toEqual([
      'Maths', 'Enrichment', 'Enrichment', 'Arabic A&B',
    ])
  })

  it('never shows two lessons in one slot', () => {
    for (const flags of [{ arabicA: true, muslim: true }, { arabicA: false, muslim: false }, {}]) {
      const slots = resolveBlocksForPupil(DAY, flags).map(b => b.start)
      expect(new Set(slots).size).toBe(slots.length)
    }
  })

  it('handles the NON_ variants (an explicitly-tagged alternative)', () => {
    const day = [
      block('09:00', 'Islamic', 'ISLAMIC'),
      block('09:00', 'Enrichment', 'NON_ISLAMIC'),
    ] as any
    expect(labels(resolveBlocksForPupil(day, { muslim: true }))).toEqual(['Islamic'])
    expect(labels(resolveBlocksForPupil(day, { muslim: false }))).toEqual(['Enrichment'])
    expect(labels(resolveBlocksForPupil(day, {}))).toEqual(['Enrichment'])
  })

  it('leaves an untagged day completely untouched', () => {
    const plain = [block('08:00', 'Maths'), block('09:00', 'English')] as any
    expect(resolveBlocksForPupil(plain, {})).toEqual(plain)
    expect(hasStreamedBlocks(plain)).toBe(false)
  })

  it('a slot with only a restricted lesson leaves an ineligible child with a free period', () => {
    const day = [block('09:00', 'Islamic', 'ISLAMIC')] as any
    expect(labels(resolveBlocksForPupil(day, { muslim: true }))).toEqual(['Islamic'])
    expect(resolveBlocksForPupil(day, { muslim: false })).toEqual([])
  })

  it('keeps a stream it does not recognise (a Hub addition is not silently hidden)', () => {
    const day = [block('09:00', 'Something New', 'FUTURE_STREAM')] as any
    expect(labels(resolveBlocksForPupil(day, {}))).toEqual(['Something New'])
  })

  it('preserves Hub ordering', () => {
    const resolved = resolveBlocksForPupil(DAY, { arabicA: true, muslim: true })
    expect(resolved.map(b => b.start)).toEqual([...resolved.map(b => b.start)].sort())
  })
})

describe('eligibilityForPupil', () => {
  const GUARDIAN = { guardianId: 'hg-1', guardianEmail: 'p@x.com' }

  it("reads one guardian's children and returns the asked-for pupil's flags", async () => {
    hubMock.getGuardianDay.mockResolvedValue({
      children: [
        { pupilId: 'hp-1', eligibility: { arabicA: true, muslim: false } },
        { pupilId: 'hp-2', eligibility: { arabicA: false, muslim: true } },
      ],
    })
    expect(await eligibilityForPupil('hub-sch', GUARDIAN, 'hp-2', '2026-09-07')).toEqual({
      arabicA: false, muslim: true,
    })
  })

  it('caches across children and days — one Hub call per guardian', async () => {
    hubMock.getGuardianDay.mockResolvedValue({
      children: [{ pupilId: 'hp-1', eligibility: { muslim: true } }],
    })
    await eligibilityForPupil('hub-sch', GUARDIAN, 'hp-1', '2026-09-07')
    await eligibilityForPupil('hub-sch', GUARDIAN, 'hp-1', '2026-09-08')
    expect(hubMock.getGuardianDay).toHaveBeenCalledTimes(1)
  })

  it('returns null (→ show the day unresolved) when Hub fails', async () => {
    hubMock.getGuardianDay.mockRejectedValue(new Error('hub down'))
    expect(await eligibilityForPupil('hub-sch', GUARDIAN, 'hp-1', '2026-09-07')).toBeNull()
  })

  it('returns null when Hub has no flags for that pupil, or no guardian identity', async () => {
    hubMock.getGuardianDay.mockResolvedValue({ children: [{ pupilId: 'other', eligibility: {} }] })
    expect(await eligibilityForPupil('hub-sch', GUARDIAN, 'hp-1', '2026-09-07')).toBeNull()

    expect(
      await eligibilityForPupil('hub-sch', { guardianId: null, guardianEmail: null }, 'hp-1', '2026-09-07'),
    ).toBeNull()
    expect(await eligibilityForPupil('hub-sch', GUARDIAN, null, '2026-09-07')).toBeNull()
  })

  it('does not pin a failure — the next call retries', async () => {
    hubMock.getGuardianDay.mockRejectedValueOnce(new Error('blip'))
    await eligibilityForPupil('hub-sch', GUARDIAN, 'hp-1', '2026-09-07')
    hubMock.getGuardianDay.mockResolvedValue({
      children: [{ pupilId: 'hp-1', eligibility: { muslim: true } }],
    })
    expect(await eligibilityForPupil('hub-sch', GUARDIAN, 'hp-1', '2026-09-07')).toEqual({ muslim: true })
  })
})

describe('guardianKeyFor', () => {
  it('prefers the Hub guardian id but always carries the email as fallback', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ hubGuardianId: 'hg-9', email: 'a@b.com' })
    expect(await guardianKeyFor('u-1')).toEqual({ guardianId: 'hg-9', guardianEmail: 'a@b.com' })

    prismaMock.user.findUnique.mockResolvedValue({ hubGuardianId: null, email: 'a@b.com' })
    expect(await guardianKeyFor('u-1')).toEqual({ guardianId: null, guardianEmail: 'a@b.com' })
  })
})
