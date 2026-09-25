// Which of a parent's children each teacher on a consultation actually teaches.
//
// A parents' evening lists every teacher taking part, and a parent of one Year 2
// child was shown all thirty — including the Year 6 teachers they have never
// met. Booking the wrong one is not a rare mistake in that list; it is the
// obvious one, and it costs two families their slot, because the teacher who
// should have been booked is now busy and the one who was booked has nothing to
// say.
//
// FAILING OPEN IS THE WHOLE DESIGN. Class links go missing, a timetable is not
// published, Hub blips. If any of that leaves a parent with no resolvable
// teachers, the answer must be "show everyone", never "show nothing" — a parent
// who sees too many can still book correctly, and a parent who sees none cannot
// book at all. So this reports what it KNOWS, and the caller decides what to do
// with an empty answer.
import prisma from './prisma.js'
import { teachingStaffForClasses, timetableLookupPossible } from './classTeachingStaff.js'
import { todayInTimezone } from './dateTime.js'

export interface FamilyTeaching {
  /** teacher's Connect user id → the parent's children they teach. */
  studentsByTeacher: Map<string, Set<string>>
  /** False when nothing could be resolved at all — no class links, no
   *  timetable, nothing. The caller must show every teacher in that case. */
  resolved: boolean
}

/**
 * Best-effort: class teachers from `StaffClassAssignment`, plus the specialists
 * who take those classes on the published timetable (the same source the parent
 * inbox uses for its contact list — one cache, one definition of "teaches").
 *
 * Legacy `Child` rows are included alongside `ParentStudentLink`, because the
 * booking route accepts ids from both and a list that disagreed with the thing
 * it feeds would hide a child's own teacher.
 */
export async function teachersForFamily(
  parentUserId: string,
  schoolId: string,
): Promise<FamilyTeaching> {
  const studentsByTeacher = new Map<string, Set<string>>()
  const add = (teacherId: string, studentId: string) => {
    const set = studentsByTeacher.get(teacherId) ?? new Set<string>()
    set.add(studentId)
    studentsByTeacher.set(teacherId, set)
  }

  const links = await prisma.parentStudentLink.findMany({
    where: { userId: parentUserId, student: { leftAt: null } },
    select: { studentId: true, student: { select: { classId: true } } },
  })
  const children: Array<{ studentId: string; classId: string }> = links
    .filter(l => !!l.student?.classId)
    .map(l => ({ studentId: l.studentId, classId: l.student!.classId }))

  if (children.length === 0) {
    const legacy = await prisma.child.findMany({
      where: { parentId: parentUserId },
      select: { id: true, classId: true },
    })
    for (const c of legacy) if (c.classId) children.push({ studentId: c.id, classId: c.classId })
  }
  if (children.length === 0) return { studentsByTeacher, resolved: false }

  const classIds = [...new Set(children.map(c => c.classId))]
  const studentsByClass = new Map<string, string[]>()
  for (const c of children) {
    studentsByClass.set(c.classId, [...(studentsByClass.get(c.classId) ?? []), c.studentId])
  }

  const assignments = await prisma.staffClassAssignment.findMany({
    where: { classId: { in: classIds }, user: { leftAt: null } },
    select: { userId: true, classId: true },
  })
  for (const a of assignments) {
    for (const studentId of studentsByClass.get(a.classId) ?? []) add(a.userId, studentId)
  }

  // Specialists — PE, music, Arabic — take the class but are not its class
  // teacher, so Hub never lists them in `teachers[]`. Entirely best-effort: a
  // Hub blip narrows the answer back to class teachers rather than failing.
  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { hubSchoolId: true, timezone: true },
    })
    if (timetableLookupPossible(school?.hubSchoolId)) {
      const classRows = await prisma.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true, hubClassId: true },
      })
      const byClass = await teachingStaffForClasses(
        schoolId,
        classRows.map(c => ({ classId: c.id, hubClassId: c.hubClassId })),
        { hubSchoolId: school?.hubSchoolId ?? null, today: todayInTimezone(school?.timezone ?? 'UTC') },
      )
      for (const [classId, staff] of byClass) {
        for (const s of staff) {
          for (const studentId of studentsByClass.get(classId) ?? []) add(s.userId, studentId)
        }
      }
    }
  } catch (error) {
    console.error('Specialist lookup failed (teacher list unaffected):', error)
  }

  return { studentsByTeacher, resolved: studentsByTeacher.size > 0 }
}
