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

/**
 * THE LEAVING DATE IS THE LAST WORKING DAY, not the first day gone.
 *
 * `leftAt` holds midnight on the date Hub gave, so comparing it against the
 * current INSTANT excluded somebody at 00:01 on a morning they were still
 * teaching — a day early, every time. Hub deactivates on a date strictly in
 * the past for exactly this reason, and so does Loop.
 *
 * The direction matters more than the day does. A leaver lingering one extra
 * day is visible: somebody sees a name they know has gone and says so. A
 * teacher locked out on what they believe is their last day reads it as a
 * broken login and files nothing — they just cannot work.
 *
 * Found by Hub, who had documented `leftOn > today` while their code did
 * `leftOn >= today`, and I built from the document.
 */
function startOfToday(now: Date): Date {
  // Anchored in UTC, deliberately, and it is worth being exact about the cost.
  // Hub computes its boundary in Asia/Dubai, so between 8pm and midnight UTC —
  // the small hours in Dubai — the two disagree by a day. In THAT direction
  // Connect is the more permissive: somebody Hub has just cut off keeps their
  // pickers here for a few more hours. Given the asymmetry above that is the
  // right way to be wrong, and it needs no school timezone threaded through
  // eight call sites, several of which have no school to hand.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Staff who have not left — no leaving date, or one that has not passed. */
export function currentStaffWhere(now: Date = new Date()) {
  return { OR: [{ leftAt: null }, { leftAt: { gte: startOfToday(now) } }] }
}

/** The same question about a row already in hand. */
export function hasLeft(leftAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !!leftAt && leftAt < startOfToday(now)
}
