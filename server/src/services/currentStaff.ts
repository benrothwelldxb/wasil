// Who counts as staff HERE, TODAY.
//
// `User.leftAt` records the date somebody leaves, which Hub will happily tell
// us months ahead: a teacher who gives notice in March for a July leaving date
// carries a July `leftAt` from March onwards. So the presence of the mark is
// not the question — the DATE is.
//
// Filtering on `leftAt: null` would take that teacher out of every picker four
// months before they stop teaching, which is the bug the column was added to
// fix, pointing the other way. It would also be much harder to notice: an empty
// picker is obvious, a picker quietly missing one teacher who is standing in
// the building is not.
//
// Spread into a `where`, or used as a relation filter:
//
//   where: { schoolId, role: { in: STAFF_ROLES }, ...currentStaffWhere() }
//   where: { classId: { in: ids }, user: currentStaffWhere() }
//
// It contributes an `OR`, so a caller that already has one must combine them
// itself (with `AND`) rather than spreading this over the top.

/** Staff who have not left yet — no leaving date, or one still to come. */
export function currentStaffWhere(now: Date = new Date()) {
  return { OR: [{ leftAt: null }, { leftAt: { gt: now } }] }
}

/** The same question about a row already in hand. */
export function hasLeft(leftAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !!leftAt && leftAt <= now
}
