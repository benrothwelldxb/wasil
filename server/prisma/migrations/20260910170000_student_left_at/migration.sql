-- Pupils who have left the school.
--
-- Hub is the roster's source of truth and models leaving as an enrolment
-- status, but its pupil list is scoped to an ACTIVE enrolment in the CURRENT
-- academic year — so a pupil marked as left in Hub simply stops appearing.
-- Connect's sync was upsert-only and never noticed: the Student row, its
-- guardian links and therefore its family stayed on the roster forever. Three
-- children who had left were still being counted on the analytics page.
--
-- Soft mark, never a delete: messages, inbox threads, reports and attendance
-- history all hang off this row. NULL = on roll, which is every existing row.
ALTER TABLE "Student" ADD COLUMN "leftAt" TIMESTAMP(3);

-- Every roster-shaped read filters on it, alongside the school.
CREATE INDEX "Student_schoolId_leftAt_idx" ON "Student"("schoolId", "leftAt");
