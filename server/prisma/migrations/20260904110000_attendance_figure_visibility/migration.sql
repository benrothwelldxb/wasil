-- Whether parents see the school's attendance percentage.
--
-- Defaults FALSE deliberately. Publishing a child's attendance figure to their
-- parents is a decision a school makes; it should not start happening on the
-- day a Hub scope is granted, to every school at once, without anyone choosing
-- it. A school that wants it turns it on.
--
-- Independent of attendanceEnabled, which gates absence requests: a school may
-- well want parents reporting absences without publishing figures back to them.
ALTER TABLE "School" ADD COLUMN "attendanceFigureVisibleToParents" BOOLEAN NOT NULL DEFAULT false;
