import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Who has seen a post. The properties worth pinning are the ones a school
 * would catch in a second if they were wrong: counts are in children, not
 * parent accounts; one parent seeing it is enough for the child; acknowledging
 * counts as seeing; and a family outside the audience never inflates the count.
 */
const prismaMock = {
  student: { findMany: vi.fn() },
  messageView: { findMany: vi.fn(), findFirst: vi.fn() },
  messageAcknowledgment: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const { postReach } = await import('../src/services/postReach')

const post = { id: 'm-1', schoolId: 's-1', targetClass: 'Year 3', classId: null, yearGroupId: 'yg-3', groupId: null }

const student = (id: string, parents: Array<[string, string]>) => ({
  id,
  firstName: id,
  lastName: 'X',
  class: { name: '3A' },
  parentLinks: parents.map(([pid, name]) => ({ user: { id: pid, name } })),
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.student.findMany.mockResolvedValue([
    student('amy', [['mum-a', 'Mum A'], ['dad-a', 'Dad A']]),
    student('ben', [['mum-b', 'Mum B'], ['dad-b', 'Dad B']]),
    student('cal', [['mum-c', 'Mum C']]),
    student('dee', []),
  ])
  prismaMock.messageView.findMany.mockResolvedValue([])
  prismaMock.messageAcknowledgment.findMany.mockResolvedValue([])
  prismaMock.messageView.findFirst.mockResolvedValue({ createdAt: new Date('2026-10-28T08:00:00Z') })
})

describe('postReach', () => {
  it('counts children, and one parent seeing it is enough for the child', async () => {
    prismaMock.messageView.findMany.mockResolvedValue([
      { userId: 'mum-a', createdAt: new Date('2026-10-28T09:00:00Z'), user: { name: 'Mum A' } },
      { userId: 'dad-a', createdAt: new Date('2026-10-28T10:00:00Z'), user: { name: 'Dad A' } },
    ])
    const r = await postReach(post)
    expect(r.children).toEqual({ total: 4, seen: 1, noParentOnConnect: 1 })
    expect(r.parents).toEqual({ total: 5, seen: 2 })
    expect(r.rows.find(x => x.studentId === 'amy')!.seen).toBe(true)
    expect(r.rows.find(x => x.studentId === 'ben')!.seen).toBe(false)
  })

  it('treats an acknowledgement as having seen it', async () => {
    prismaMock.messageAcknowledgment.findMany.mockResolvedValue([
      { userId: 'mum-c', createdAt: new Date('2026-10-28T09:00:00Z'), user: { name: 'Mum C' } },
    ])
    const r = await postReach(post)
    const cal = r.rows.find(x => x.studentId === 'cal')!
    expect(cal.seen).toBe(true)
    expect(cal.parents[0]).toMatchObject({ seenAt: null, acknowledgedAt: '2026-10-28T09:00:00.000Z' })
  })

  it('lists a viewer outside the audience separately instead of counting them', async () => {
    prismaMock.messageView.findMany.mockResolvedValue([
      { userId: 'leaver', createdAt: new Date(), user: { name: 'Left Family' } },
    ])
    const r = await postReach(post)
    expect(r.children.seen).toBe(0)
    expect(r.parents.seen).toBe(0)
    expect(r.otherViewers.map(v => v.id)).toEqual(['leaver'])
  })

  it('resolves the audience like the send does: year group, current pupils, no test accounts', async () => {
    await postReach(post)
    expect(prismaMock.student.findMany.mock.calls[0][0].where).toEqual({
      schoolId: 's-1', leftAt: null, isTest: false, class: { yearGroupId: 'yg-3' },
    })
  })

  it('a group wins over a class name, as it does when sending', async () => {
    await postReach({ ...post, groupId: 'g-1', yearGroupId: null })
    expect(prismaMock.student.findMany.mock.calls[0][0].where).toMatchObject({ groupLinks: { some: { groupId: 'g-1' } } })
  })

  it('says so when a legacy post names its audience by text only', async () => {
    prismaMock.messageView.findMany.mockResolvedValue([
      { userId: 'mum-a', createdAt: new Date(), user: { name: 'Mum A' } },
    ])
    const r = await postReach({ ...post, yearGroupId: null })
    expect(prismaMock.student.findMany).not.toHaveBeenCalled()
    expect(r.audienceKnown).toBe(false)
    expect(r.otherViewers.map(v => v.id)).toEqual(['mum-a'])
  })
})
