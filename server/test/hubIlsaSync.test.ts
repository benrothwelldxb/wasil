import { describe, it, expect, vi, beforeEach } from 'vitest'

// hubIlsaSync — pull Hub's ILSA roster into Connect (role-ILSA users + IlsaLink
// rows), with the lifecycle sweep that deactivates links Hub unlinked/dropped.
// Prisma + the Hub MIS client are mocked.

const prismaMock = {
  school: { findUnique: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  student: { findFirst: vi.fn() },
  ilsaLink: { upsert: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const misMock = { listIlsas: vi.fn() }
// Only the network call is stubbed. normaliseIlsa is a pure function and runs
// for real, so these tests exercise Hub's actual field shape rather than
// asserting against whatever the fixtures happen to say — which is how the
// wrong shape passed a green suite in the first place.
vi.mock('../src/services/hubMis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/hubMis')>()
  return { ...actual, ...misMock }
})

const { syncIlsasForSchool } = await import('../src/services/hubIlsaSync')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: 'hub-1' })
  prismaMock.ilsaLink.updateMany.mockResolvedValue({ count: 0 })
  // The post-sync check: by default everything provisioned resolves, so tests
  // about the loop itself are not also asserting the verification.
  prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'ILSA', schoolId: 'sch-1', name: 'Ms Support' })
  prismaMock.ilsaLink.findFirst.mockResolvedValue({ studentId: 'stu-1', hubPupilId: 'hp-1' })
})

describe('syncIlsasForSchool', () => {
  it('no-op for a school with no hubSchoolId (never calls Hub)', async () => {
    prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: null })
    const summary = await syncIlsasForSchool('sch-1')
    expect(misMock.listIlsas).not.toHaveBeenCalled()
    expect(summary.linksActive).toBe(0)
  })

  it('creates a brand-new role-ILSA user and an active link for an active Hub ILSA', async () => {
    misMock.listIlsas.mockResolvedValue([
      // Hub's real shape: a record `id` distinct from `hubUserId`, one `name`,
      // and `pupilIds` as an array.
      { id: 'rec-1', hubUserId: 'hu-ilsa', name: 'Ms Support', email: 'ilsa@x.com', pupilIds: ['hp-1'], active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValue(null) // not linked, no email match
    prismaMock.user.create.mockResolvedValue({ id: 'ilsa-1' })
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })

    const summary = await syncIlsasForSchool('sch-1')

    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { email: 'ilsa@x.com', name: 'Ms Support', role: 'ILSA', schoolId: 'sch-1', hubUserId: 'hu-ilsa' },
      select: { id: true },
    })
    expect(prismaMock.ilsaLink.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_studentId: { userId: 'ilsa-1', studentId: 'stu-1' } },
      create: expect.objectContaining({ schoolId: 'sch-1', userId: 'ilsa-1', studentId: 'stu-1', hubPupilId: 'hp-1', active: true }),
      update: { active: true, deactivatedAt: null, hubPupilId: 'hp-1' },
    }))
    expect(summary).toMatchObject({ fetched: 1, created: 1, linksActive: 1 })
    // The sweep excludes the link we just reaffirmed.
    expect(prismaMock.ilsaLink.updateMany.mock.calls[0][0].where).toEqual({
      schoolId: 'sch-1', active: true, id: { notIn: ['link-1'] },
    })
  })

  it('skips an ILSA with no email (can’t back a login)', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'hu-ilsa', firstName: 'No', lastName: 'Email', email: null, pupilId: 'hp-1', active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValue(null)
    const summary = await syncIlsasForSchool('sch-1')
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(summary.skippedNoEmail).toBe(1)
    expect(summary.linksActive).toBe(0)
  })

  it('counts an ILSA whose pupil isn’t synced yet, without linking', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'hu-ilsa', firstName: 'Ms', lastName: 'Support', email: 'ilsa@x.com', pupilId: 'hp-x', active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 'ilsa-1' }) // already linked by hubUserId
    prismaMock.user.update.mockResolvedValue({})
    prismaMock.student.findFirst.mockResolvedValue(null) // pupil not synced
    const summary = await syncIlsasForSchool('sch-1')
    expect(prismaMock.ilsaLink.upsert).not.toHaveBeenCalled()
    expect(summary.skippedNoPupil).toBe(1)
  })

  it('deactivates a stale link when Hub returns the ILSA as inactive', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'rec-1', hubUserId: 'hu-ilsa', name: 'Ms Support', email: 'ilsa@x.com', pupilIds: ['hp-1'], active: false },
    ])
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 'ilsa-1' }) // linked
    prismaMock.user.update.mockResolvedValue({})
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.updateMany.mockResolvedValue({ count: 1 })

    const summary = await syncIlsasForSchool('sch-1')
    // Inactive ILSA is never upserted active; the sweep deactivates every active
    // link (nothing was reaffirmed → no notIn filter).
    expect(prismaMock.ilsaLink.upsert).not.toHaveBeenCalled()
    expect(prismaMock.ilsaLink.updateMany).toHaveBeenCalledWith({
      where: { schoolId: 'sch-1', active: true },
      data: { active: false, deactivatedAt: expect.any(Date) },
    })
    expect(summary.linksDeactivated).toBe(1)
  })
})

// listIlsas 404-tolerates, so a Hub endpoint that isn't deployed for a school
// arrives here identically to a school that genuinely has no ILSAs: zero. The
// fetched count is what lets an admin tell those apart — without it, "Hub sent
// us nothing" and "we dropped everything Hub sent" look the same on screen.
describe('what Hub actually sent', () => {
  it('reports how many ILSAs came back', async () => {
    misMock.listIlsas.mockResolvedValue([])
    const summary = await syncIlsasForSchool('school-1')
    expect(summary.fetched).toBe(0)
  })
})

/**
 * Hub's real field shape.
 *
 * This file previously asserted against fixtures that carried the same wrong
 * assumption as the DTO — `id` as a user id, a singular `pupilId`, split name
 * fields — so a green suite proved only that the code agreed with itself. These
 * cover what Hub actually sends, and the failure modes the mismatch caused.
 */
describe('Hub ILSA field shape', () => {
  const base = {
    id: 'rec-1',
    hubUserId: 'hu-1',
    name: 'Ms Support',
    email: 'ilsa@x.com',
    pupilIds: ['hp-1'],
    active: true,
  }

  beforeEach(() => {
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'ilsa-1' })
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })
    prismaMock.ilsaLink.updateMany.mockResolvedValue({ count: 0 })
  })

  // The identity bug: `id` is the ILSA record, `hubUserId` is the SSO subject
  // Desk presents. Storing the former meant nothing could ever resolve.
  it('stores hubUserId, never the record id', async () => {
    misMock.listIlsas.mockResolvedValue([base])

    await syncIlsasForSchool('sch-1')

    const created = prismaMock.user.create.mock.calls[0][0].data
    expect(created.hubUserId).toBe('hu-1')
    expect(created.hubUserId).not.toBe('rec-1')
  })

  it('reads the pupil out of the pupilIds array', async () => {
    misMock.listIlsas.mockResolvedValue([base])
    await syncIlsasForSchool('sch-1')
    expect(prismaMock.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hubPupilId: 'hp-1', schoolId: 'sch-1' } }),
    )
  })

  it('takes the single name field', async () => {
    misMock.listIlsas.mockResolvedValue([base])
    await syncIlsasForSchool('sch-1')
    expect(prismaMock.user.create.mock.calls[0][0].data.name).toBe('Ms Support')
  })

  // Tolerated rather than swapped: this is an unvalidated external shape and
  // guessing wrong once already cost two days.
  it('still accepts the older singular/split spelling', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'rec-1', hubUserId: 'hu-1', firstName: 'Ms', lastName: 'Support', email: 'ilsa@x.com', pupilId: 'hp-1', active: true },
    ])

    await syncIlsasForSchool('sch-1')

    expect(prismaMock.user.create.mock.calls[0][0].data.name).toBe('Ms Support')
    expect(prismaMock.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hubPupilId: 'hp-1', schoolId: 'sch-1' } }),
    )
  })

  // The crash: undefined reached a required column and Prisma rejected it,
  // taking the whole sync down so one bad record looked like an empty roster.
  it('skips a record with no pupil id instead of throwing', async () => {
    misMock.listIlsas.mockResolvedValue([{ ...base, pupilIds: [] }])

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.skippedNoPupilId).toBe(1)
    expect(prismaMock.ilsaLink.upsert).not.toHaveBeenCalled()
  })

  // Hub leaves hubUserId null until first sign-in. A null must never reach the
  // lookup: `where: { hubUserId: null }` matches the first user in the school
  // with none, handing this ILSA someone else's account.
  it('never looks a user up by a null hubUserId', async () => {
    misMock.listIlsas.mockResolvedValue([{ ...base, hubUserId: null }])

    const summary = await syncIlsasForSchool('sch-1')

    for (const call of prismaMock.user.findFirst.mock.calls) {
      expect(call[0].where).not.toHaveProperty('hubUserId')
    }
    // Provisioned and linked, but not resolvable until a later sync has an id.
    expect(summary.withoutHubUserId).toBe(1)
    expect(prismaMock.user.create.mock.calls[0][0].data.hubUserId).toBeUndefined()
  })
})

// The failure that reports itself as a success. An ILSA whose Connect account
// already exists under another role is linked and counted — but resolveIlsaActor
// requires role ILSA, so they can never actually message anyone. Guardians and
// staff are provisioned BEFORE ILSAs in the same sync run, so an ILSA sharing an
// email with a guardian hits this on the very first sync.
describe('an ILSA whose account already exists under another role', () => {
  const ilsa = {
    id: 'rec-1', hubUserId: 'hu-1', name: 'Ms Support',
    email: 'ilsa@x.com', pupilIds: ['hp-1'], active: true,
  }

  beforeEach(() => {
    misMock.listIlsas.mockResolvedValue([ilsa])
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })
    prismaMock.ilsaLink.updateMany.mockResolvedValue({ count: 0 })
  })

  it('is counted as a role conflict, not silently as linked', async () => {
    prismaMock.user.findFirst.mockImplementation(async ({ where }: any) =>
      where.email ? { id: 'u-1', hubUserId: null, role: 'PARENT' } : null,
    )

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.roleConflict).toBe(1)
    // Still linked and still given its pupil link — the account is real and the
    // conflict may be resolved by a person later.
    expect(summary.linked).toBe(1)
  })

  it('leaves the existing role alone', async () => {
    prismaMock.user.findFirst.mockImplementation(async ({ where }: any) =>
      where.email ? { id: 'u-1', hubUserId: null, role: 'PARENT' } : null,
    )

    await syncIlsasForSchool('sch-1')

    expect(prismaMock.user.update.mock.calls[0][0].data).not.toHaveProperty('role')
  })

  it('an account already under role ILSA is no conflict', async () => {
    prismaMock.user.findFirst.mockImplementation(async ({ where }: any) =>
      where.email ? { id: 'u-1', hubUserId: null, role: 'ILSA' } : null,
    )

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.roleConflict).toBe(0)
  })

  /**
   * The conflict used to conceal itself after the first run.
   *
   * The check lived only on the email path. That path also CLAIMS the
   * hubUserId — so the very next sync matched on the id instead, where nothing
   * looked at the role, and reported the same dead end as a clean success. The
   * warning appeared once, weeks before anyone thought to look, and never
   * again, while the person kept getting a 403 from Desk.
   */
  describe('matched by hubUserId rather than email', () => {
    const matchedById = (role: string) =>
      prismaMock.user.findFirst.mockImplementation(async ({ where }: any) =>
        where.hubUserId ? { id: 'u-1', email: 'claudia@example.ae', role } : null,
      )

    it('still reports the conflict on every run, not just the first', async () => {
      matchedById('PARENT')

      const first = await syncIlsasForSchool('sch-1')
      const second = await syncIlsasForSchool('sch-1')

      expect(first.roleConflict).toBe(1)
      expect(second.roleConflict).toBe(1)
    })

    // A count alone leaves an admin with a number and nowhere to look — and a
    // name alone still leaves the decision needing a database query, because
    // the ROLE is what decides it. A guardian or staff member is a real person
    // with another job at the school; anything else is an artefact.
    it('names who cannot message, and which role is in the way', async () => {
      matchedById('STAFF')
      const summary = await syncIlsasForSchool('sch-1')
      expect(summary.roleConflicts).toEqual([{ email: 'claudia@example.ae', role: 'STAFF' }])
    })

    it('is still counted as linked — the account is real', async () => {
      matchedById('PARENT')
      const summary = await syncIlsasForSchool('sch-1')
      expect(summary.linked).toBe(1)
    })

    it('an ILSA matched by id under role ILSA is no conflict', async () => {
      matchedById('ILSA')
      const summary = await syncIlsasForSchool('sch-1')
      expect(summary.roleConflict).toBe(0)
      expect(summary.roleConflicts).toEqual([])
    })
  })
})

/**
 * The account holds a DIFFERENT Hub id from the one Hub sends.
 *
 * The claim is refused, correctly — one person's identity must never be
 * re-pointed at another. But the refusal was silent: the email match still
 * succeeded, the pupil link still went active, and the sync still counted them
 * among the linked, while every partner call for that person 403'd because the
 * resolver looks up the id Hub sends and the row holds another.
 *
 * A legitimate refusal reporting itself as a success is the same fault as the
 * role conflict that used to hide, in a different place.
 */
describe('an account holding the wrong Hub id', () => {
  const HUB_USER_ID = 'ncWYLfVnnSACfLLVx9twUyn1AlxbqcLk'
  const RECORD_ID = 'cmtkcv82l48vura0l23g8zt57'

  const hubSends = () =>
    misMock.listIlsas.mockResolvedValue([
      { id: RECORD_ID, hubUserId: HUB_USER_ID, name: 'Claudia Mbeng', email: 'claudia@x.ae', pupilIds: ['hp-1'], active: true },
    ])

  /** No match on the id (the row holds another), then a match on the email. */
  const rowHolding = (held: string) =>
    prismaMock.user.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.hubUserId && !where.NOT) return null
      if (where.email) return { id: 'u-1', email: 'claudia@x.ae', role: 'ILSA', hubUserId: held }
      return null
    })

  beforeEach(() => {
    hubSends()
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })
    prismaMock.user.update.mockResolvedValue({})
  })

  describe('when the held value is this ILSA’s own Hub RECORD id', () => {
    // Provably an artefact of an older version of this code, not a collision:
    // no SSO subject will ever match a record id, so replacing it re-points
    // nobody.
    it('repairs it and says whose, and to what', async () => {
      rowHolding(RECORD_ID)
      const summary = await syncIlsasForSchool('sch-1')

      expect(summary.repairedLegacyId).toEqual([{ email: 'claudia@x.ae', was: RECORD_ID }])
      expect(summary.idMismatch).toEqual([])
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ hubUserId: HUB_USER_ID }) }),
      )
    })

    // Two accounts disagreeing about who someone is must be reported, never
    // resolved by a sync picking one.
    it('refuses to repair when another account already holds the correct id', async () => {
      prismaMock.user.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.NOT) return { id: 'someone-else' }      // the target id is taken
        if (where.hubUserId) return null
        if (where.email) return { id: 'u-1', email: 'claudia@x.ae', role: 'ILSA', hubUserId: RECORD_ID }
        return null
      })

      const summary = await syncIlsasForSchool('sch-1')

      expect(summary.repairedLegacyId).toEqual([])
      expect(summary.idMismatch).toEqual([
        { email: 'claudia@x.ae', held: RECORD_ID, expected: HUB_USER_ID },
      ])
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ hubUserId: expect.anything() }) }),
      )
    })
  })

  describe('when the held value is anything else', () => {
    // Could be another real person's identity. Reported, never touched.
    it('reports it with both ids and does not repair', async () => {
      rowHolding('some-other-persons-id')
      const summary = await syncIlsasForSchool('sch-1')

      expect(summary.idMismatch).toEqual([
        { email: 'claudia@x.ae', held: 'some-other-persons-id', expected: HUB_USER_ID },
      ])
      expect(summary.repairedLegacyId).toEqual([])
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ hubUserId: expect.anything() }) }),
      )
    })

    // The bug this whole thread was about: reported as success, every run.
    it('is no longer counted as a clean linked account and nothing else', async () => {
      rowHolding('some-other-persons-id')
      const summary = await syncIlsasForSchool('sch-1')

      expect(summary.linked).toBe(1)
      expect(summary.idMismatch).toHaveLength(1)
      expect(summary.roleConflict).toBe(0)
    })
  })

  it('an account holding exactly the right id is neither reported nor touched', async () => {
    rowHolding(HUB_USER_ID)
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.idMismatch).toEqual([])
    expect(summary.repairedLegacyId).toEqual([])
  })
})

/**
 * "1 not signed into Hub yet" was the line that could have named the problem,
 * and it named nobody.
 *
 * It has been non-zero in every banner for weeks. Everyone read past it as
 * somebody else — and the count is genuinely ambiguous: it means "Hub's ILSA
 * list sent no hubUserId for this person", which is usually "they have not
 * signed in" but is indistinguishable from "Hub holds their id and this
 * payload omits it". Those need completely different people to act.
 */
describe('an ILSA Hub sends no user id for', () => {
  beforeEach(() => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'rec-9', hubUserId: null, name: 'Claudia Mbeng', email: 'claudia@x.ae', pupilIds: ['hp-1'], active: true },
    ])
    prismaMock.user.findFirst.mockImplementation(async ({ where }: any) =>
      where.email ? { id: 'u-1', email: 'claudia@x.ae', role: 'ILSA', hubUserId: null } : null,
    )
    prismaMock.user.update.mockResolvedValue({})
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })
  })

  it('names them rather than only counting them', async () => {
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.withoutHubUserId).toBe(1)
    expect(summary.withoutHubUserIdEmails).toEqual(['claudia@x.ae'])
  })

  // Not a role conflict and not an id mismatch — the two things already
  // reported. Without the name, this state is invisible in every other counter.
  it('is not reported as either of the faults that ARE named', async () => {
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.roleConflict).toBe(0)
    expect(summary.idMismatch).toEqual([])
    expect(summary.repairedLegacyId).toEqual([])
  })

  // Still provisioned and still linked to their pupil — the account is real and
  // the moment Hub sends the id, the ordinary email path claims it.
  it('is still linked, and still counted among the linked', async () => {
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.linked).toBe(1)
    expect(summary.linksActive).toBe(1)
  })

  // The null must never reach the query: `where: { hubUserId: null }` matches
  // the first user in the school who happens to have none.
  it('never looks a user up by a null id', async () => {
    await syncIlsasForSchool('sch-1')
    const lookups = prismaMock.user.findFirst.mock.calls.map((c: any) => c[0].where)
    expect(lookups.some((w: any) => 'hubUserId' in w && w.hubUserId === null)).toBe(false)
  })
})

/**
 * Who Hub actually sent.
 *
 * Every other counter in this summary only ever describes ILSAs that reached
 * the loop. Someone missing from Hub's list appears in none of them — not a
 * role conflict, not an id mismatch, not missing an id — and the sync reports a
 * clean success while they cannot message, because Connect was never told they
 * exist. `fetched: 8` is only reassuring if the eight are the eight you
 * expected.
 */
describe('the fetched roster', () => {
  it('names everyone Hub sent', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'r1', hubUserId: 'hu-1', name: 'A', email: 'a@x.ae', pupilIds: ['hp-1'], active: true },
      { id: 'r2', hubUserId: 'hu-2', name: 'B', email: 'B@X.AE', pupilIds: ['hp-2'], active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'u-1' })
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.fetched).toBe(2)
    // Lowercased, so comparing against a staff list is not a case-sensitivity
    // puzzle.
    expect(summary.fetchedEmails).toEqual(['a@x.ae', 'b@x.ae'])
  })

  // Taken from the payload BEFORE the loop filters anyone, so it answers "who
  // did Hub send" rather than "who did we accept".
  it('includes someone the loop then skips', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'r1', hubUserId: 'hu-1', name: 'A', email: 'a@x.ae', pupilIds: [], active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValue(null)

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.skippedNoPupilId).toBe(1)
    expect(summary.fetchedEmails).toEqual(['a@x.ae'])
  })

  it('is empty, not absent, when Hub sends none', async () => {
    misMock.listIlsas.mockResolvedValue([])
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.fetched).toBe(0)
    expect(summary.fetchedEmails).toEqual([])
  })
})

/**
 * The id, not just the name.
 *
 * An ILSA can be fetched, matched, linked and reported completely clean and
 * still be unreachable — if the hubUserId Hub's ILSA LIST carries for them is
 * not the one the partner caller sends. Connect stores one, Desk asks with the
 * other, both are internally consistent, and every counter here says success.
 * No count can show that. Only the value can.
 */
describe('the recorded Hub user id', () => {
  beforeEach(() => {
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'u-1' })
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })
  })

  it('reports the id against each address', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'rec-1', hubUserId: 'ncWYLfVnnSACfLLVx9twUyn1AlxbqcLk', name: 'C', email: 'claudia@x.ae', pupilIds: ['hp-1'], active: true },
    ])

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.fetchedHubUserIds).toEqual([
      { email: 'claudia@x.ae', hubUserId: 'ncWYLfVnnSACfLLVx9twUyn1AlxbqcLk' },
    ])
  })

  // Read through normaliseIlsa rather than off the raw row, so it reports what
  // the sync will actually STORE. Confusing those two is what put a record id
  // in this column once already.
  it('reports the id the sync would store, never the record id', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'cmtkcv82l48vura0l23g8zt57', hubUserId: 'hu-real', name: 'C', email: 'claudia@x.ae', pupilIds: ['hp-1'], active: true },
    ])

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.fetchedHubUserIds[0].hubUserId).toBe('hu-real')
    expect(summary.fetchedHubUserIds[0].hubUserId).not.toBe('cmtkcv82l48vura0l23g8zt57')
  })

  it('reports null for an ILSA Hub sent no id for', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'rec-2', hubUserId: null, name: 'P', email: 'pnwamaka@x.ae', pupilIds: ['hp-1'], active: true },
    ])

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.fetchedHubUserIds).toEqual([{ email: 'pnwamaka@x.ae', hubUserId: null }])
  })
})

/**
 * The sync checks whether it worked.
 *
 * Every other counter reports a STEP. This one reports the outcome: after all
 * the matching and linking, can these people actually message? Six counters
 * were added here in one day, each finding a fault the previous had concealed,
 * and none would have been needed if the sync had ever asked that.
 */
describe('verifying its own outcome', () => {
  beforeEach(() => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'r1', hubUserId: 'hu-ok', name: 'A', email: 'a@x.ae', pupilIds: ['hp-1'], active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'u-1' })
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })
  })

  it('reports nobody unresolvable when everything worked, and says how many it checked', async () => {
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.unresolvable).toEqual([])
    // "None unresolvable" and "nobody was checked" must not read the same.
    expect(summary.verified).toBe(1)
  })

  // The case this whole sequence was chasing: every counter clean, still 403.
  it('catches an ILSA who passed every other counter and still cannot message', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null) // nothing holds that Hub id

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.roleConflict).toBe(0)
    expect(summary.idMismatch).toEqual([])
    expect(summary.withoutHubUserId).toBe(0)
    expect(summary.unresolvable).toEqual([
      { email: 'a@x.ae', hubUserId: 'hu-ok', why: 'no Connect account holds this Hub id' },
    ])
  })

  it('names a wrong role, and which role', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'PARENT', schoolId: 'sch-1', name: 'A' })
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.unresolvable[0].why).toBe('account role is PARENT, not ILSA')
  })

  it('names a missing pupil link', async () => {
    prismaMock.ilsaLink.findFirst.mockResolvedValue(null)
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.unresolvable[0].why).toBe('no active pupil link')
  })

  // Already reported by name, and there is nothing to resolve.
  it('does not check an ILSA Hub sent no id for', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'r2', hubUserId: null, name: 'B', email: 'b@x.ae', pupilIds: ['hp-1'], active: true },
    ])
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.verified).toBe(0)
    expect(summary.unresolvable).toEqual([])
    expect(summary.withoutHubUserId).toBe(1)
  })
})

/**
 * Resolving is not the same as resolving to the RIGHT child.
 *
 * A refused ILSA is a person who cannot do their job. A crossed one is a
 * private safeguarding thread about the wrong family, opened by somebody with
 * every reason to think it is the right one — and it looks healthy from every
 * single app, because each app's own view is internally consistent.
 *
 * `resolveIlsa` takes the FIRST active link, so an ILSA holding two — Hub
 * re-linked them and the older row was never deactivated — is silently pointed
 * at whichever came first.
 */
describe('the right child, not just a child', () => {
  beforeEach(() => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'r1', hubUserId: 'hu-1', name: 'C', email: 'claudia@x.ae', pupilIds: ['hp-alisa'], active: true },
    ])
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({ id: 'u-1' })
    prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
    prismaMock.ilsaLink.upsert.mockResolvedValue({ id: 'link-1' })
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'ILSA', schoolId: 'sch-1', name: 'C' })
  })

  it('says nothing when the resolved pupil is the one Hub linked', async () => {
    prismaMock.ilsaLink.findFirst.mockResolvedValue({ studentId: 'stu-1', hubPupilId: 'hp-alisa' })
    const summary = await syncIlsasForSchool('sch-1')
    expect(summary.wrongPupil).toEqual([])
    expect(summary.unresolvable).toEqual([])
  })

  // The case no "does it resolve" check can see: a clean 200 for the wrong
  // family.
  it('catches an ILSA who resolves to a different pupil than Hub linked', async () => {
    prismaMock.ilsaLink.findFirst.mockResolvedValue({ studentId: 'stu-9', hubPupilId: 'hp-someone-else' })

    const summary = await syncIlsasForSchool('sch-1')

    // Resolution SUCCEEDS — which is exactly why this needed its own check.
    expect(summary.unresolvable).toEqual([])
    expect(summary.wrongPupil).toEqual([
      { email: 'claudia@x.ae', hubLinked: 'hp-alisa', resolvedTo: 'hp-someone-else' },
    ])
  })

  // Hub sending no pupil is already reported by its own counter; comparing
  // against nothing would invent a mismatch.
  it('does not report a mismatch when Hub linked no pupil at all', async () => {
    misMock.listIlsas.mockResolvedValue([
      { id: 'r1', hubUserId: 'hu-1', name: 'C', email: 'claudia@x.ae', pupilIds: [], active: true },
    ])
    prismaMock.ilsaLink.findFirst.mockResolvedValue({ studentId: 'stu-1', hubPupilId: 'hp-anything' })

    const summary = await syncIlsasForSchool('sch-1')

    expect(summary.wrongPupil).toEqual([])
    expect(summary.skippedNoPupilId).toBe(1)
  })
})
