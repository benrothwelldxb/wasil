-- This-week timetable overrides — a Connect-owned exception layer over the
-- Hub-sourced timetable. Staff cancel or move a specialist session for a
-- specific day without editing Hub. `GET /api/timetable/today` and `/grid`
-- apply these on top of Hub's resolved reminders: drop the CANCELLED subject,
-- append the ADDED one. `subjectKey` is the same normalised match key
-- SubjectReminder uses (subjectKeyOf). Additive; no backfill.

-- CreateTable
CREATE TABLE "TimetableOverride" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "emoji" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimetableOverride_schoolId_classId_date_idx" ON "TimetableOverride"("schoolId", "classId", "date");

-- AddForeignKey
ALTER TABLE "TimetableOverride" ADD CONSTRAINT "TimetableOverride_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableOverride" ADD CONSTRAINT "TimetableOverride_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
