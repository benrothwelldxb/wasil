import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Which teachers a parent is offered at a parents' evening.
 *
 * The page listed every teacher taking part. A parent of one Year 2 child was
 * shown all thirty — the Year 6 teachers, the head of maths, and anyone whose
 * class link happened to be missing. Booking the wrong one is not a rare
 * mistake in that list; it is the obvious one, and it costs TWO families their
 * slot: the teacher who should have been booked is now busy, and the one who
 * was booked has nothing to say about a child they do not teach.
 *
 * FAILING OPEN IS THE PROPERTY THAT MATTERS, and it is the one a filter like
 * this gets wrong. Class links go missing, timetables go unpublished, Hub
 * blips. A parent shown too many teachers can still book correctly. A parent
 * shown none cannot book at all — and would have no way to know why, on the one
 * evening it matters.
 */

const prismaMock = {
  parentStudentLink: { findMany: vi.fn() },
  child: { findMany: vi.fn() },
  staffClassAssignment: { findMany: vi.fn() },
  school: { findUnique: vi.fn() },
  class: { findMany: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))

const teachingStaffForClasses = vi.fn()
const timetableLookupPossible = vi.fn()
vi.mock('../src/services/classTeachingStaff', () => ({
  teachingStaffForClasses,
  timetableLookupPossible,
}))

const { teachersForFamily } = await import('../src/services/consultationTeachersForFamily')

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.parentStudentLink.findMany.mockResolvedValue([])
  prismaMock.child.findMany.mockResolvedValue([])
  prismaMock.staffClassAssignment.findMany.mockResolvedValue([])
  prismaMock.school.findUnique.mockResolvedValue({ hubSchoolId: 'hub-1', timezone: 'Asia/Dubai' })
  prismaMock.class.findMany.mockResolvedValue([])
  timetableLookupPossible.mockReturnValue(false)
  teachingStaffForClasses.mockResolvedValue(new Map())
})

describe('who teaches this family', () => {
  it('maps a class teacher to the child in that class', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { studentId: 'stu-1', student: { classId: 'cls-2A' } },
    ])
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([
      { userId: 'teach-2A', classId: 'cls-2A' },
    ])

    const r = await teachersForFamily('parent-1', 'sch-1')

    expect([...(r.studentsByTeacher.get('teach-2A') ?? [])]).toEqual(['stu-1'])
    expect(r.resolved).toBe(true)
  })

  it('maps a teacher of TWO of this parent’s children to both', async () => {
    // A teacher who takes both a Year 2 and a Year 3 class, or two siblings in
    // the same class. Either way the parent must see one row that covers both.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { studentId: 'stu-1', student: { classId: 'cls-2A' } },
      { studentId: 'stu-2', student: { classId: 'cls-2A' } },
    ])
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([
      { userId: 'teach-2A', classId: 'cls-2A' },
    ])

    const r = await teachersForFamily('parent-1', 'sch-1')

    expect([...(r.studentsByTeacher.get('teach-2A') ?? [])].sort()).toEqual(['stu-1', 'stu-2'])
  })

  it('includes the specialists who take that class on the timetable', async () => {
    // PE, music, Arabic. Hub never lists them in a class's `teachers[]`, so
    // without this they read as "not your child's teacher" and get filtered
    // out of an evening they are attending.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { studentId: 'stu-1', student: { classId: 'cls-2A' } },
    ])
    prismaMock.class.findMany.mockResolvedValue([{ id: 'cls-2A', hubClassId: 'hc-2A' }])
    timetableLookupPossible.mockReturnValue(true)
    teachingStaffForClasses.mockResolvedValue(
      new Map([['cls-2A', [{ userId: 'teach-pe', name: 'Mr PE', avatarUrl: null, subjects: ['PE'] }]]]),
    )

    const r = await teachersForFamily('parent-1', 'sch-1')

    expect([...(r.studentsByTeacher.get('teach-pe') ?? [])]).toEqual(['stu-1'])
  })

  it('never offers a teacher who has left', async () => {
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { studentId: 'stu-1', student: { classId: 'cls-2A' } },
    ])
    await teachersForFamily('parent-1', 'sch-1')

    const where = prismaMock.staffClassAssignment.findMany.mock.calls[0][0].where
    expect(where.user).toEqual({ leftAt: null })
  })

  it('falls back to legacy Child rows when there are no student links', async () => {
    // The booking route accepts ids from both, so a list that read only one
    // would hide a child's own teacher from them.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([])
    prismaMock.child.findMany.mockResolvedValue([{ id: 'kid-1', classId: 'cls-2A' }])
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([
      { userId: 'teach-2A', classId: 'cls-2A' },
    ])

    const r = await teachersForFamily('parent-1', 'sch-1')

    expect([...(r.studentsByTeacher.get('teach-2A') ?? [])]).toEqual(['kid-1'])
  })
})

describe('failing open', () => {
  it('reports UNRESOLVED when the parent has no children we can place', async () => {
    const r = await teachersForFamily('parent-1', 'sch-1')

    expect(r.resolved).toBe(false)
    expect(r.studentsByTeacher.size).toBe(0)
  })

  it('reports UNRESOLVED when a child has a class but nobody is assigned to it', async () => {
    // THE ONE THAT WOULD EMPTY THE PAGE. A missing class-teacher assignment is
    // ordinary — it happens whenever Hub has not reconciled yet. Reporting
    // "resolved, and the answer is nobody" would leave this parent unable to
    // book at all on the evening it matters.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { studentId: 'stu-1', student: { classId: 'cls-2A' } },
    ])
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([])

    const r = await teachersForFamily('parent-1', 'sch-1')

    expect(r.resolved).toBe(false)
  })

  it('keeps the class teachers when the timetable lookup throws', async () => {
    // A Hub blip narrows the answer to class teachers. It must not lose them.
    prismaMock.parentStudentLink.findMany.mockResolvedValue([
      { studentId: 'stu-1', student: { classId: 'cls-2A' } },
    ])
    prismaMock.staffClassAssignment.findMany.mockResolvedValue([
      { userId: 'teach-2A', classId: 'cls-2A' },
    ])
    timetableLookupPossible.mockReturnValue(true)
    prismaMock.class.findMany.mockResolvedValue([{ id: 'cls-2A', hubClassId: 'hc-2A' }])
    teachingStaffForClasses.mockRejectedValue(new Error('hub down'))

    const r = await teachersForFamily('parent-1', 'sch-1')

    expect(r.resolved).toBe(true)
    expect([...(r.studentsByTeacher.get('teach-2A') ?? [])]).toEqual(['stu-1'])
  })

  it('asks only about this parent’s own children, and only current ones', async () => {
    await teachersForFamily('parent-1', 'sch-1')

    const where = prismaMock.parentStudentLink.findMany.mock.calls[0][0].where
    expect(where.userId).toBe('parent-1')
    expect(where.student).toEqual({ leftAt: null })
  })
})
