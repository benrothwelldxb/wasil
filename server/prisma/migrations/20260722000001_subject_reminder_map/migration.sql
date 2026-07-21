-- Per-school, admin-editable reminder wording for Hub-sourced timetable subjects.
-- The Hub "Today your child has …" helper (GET /api/timetable/today) matches a
-- timetabled block's subject name (case-insensitive, via subjectKey) against
-- these rows and, on a hit, emits the emoji + parent-facing reminder text.
-- Distinct from ScheduleItem (the manual schedule grid) — this is the Hub
-- timetable's parallel, editable nudge table.

-- CreateTable
CREATE TABLE "SubjectReminder" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "reminder" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectReminder_schoolId_idx" ON "SubjectReminder"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectReminder_schoolId_subjectKey_key" ON "SubjectReminder"("schoolId", "subjectKey");

-- AddForeignKey
ALTER TABLE "SubjectReminder" ADD CONSTRAINT "SubjectReminder_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the default wording for every existing school (mirrors the admin
-- "Schedule & Reminders" page's existing recurring-type wording). Idempotent via
-- the (schoolId, subjectKey) unique index, so re-running is a no-op and it never
-- clobbers an admin's later edits.
INSERT INTO "SubjectReminder" ("id", "schoolId", "subject", "subjectKey", "emoji", "reminder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."id", d."subject", d."subjectKey", d."emoji", d."reminder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "School" s
CROSS JOIN (VALUES
    ('Swimming', 'swimming', '🏊', 'Remember swimwear, towel & goggles'),
    ('PE',       'pe',       '🏃', 'Please wear PE kit'),
    ('Library',  'library',  '📚', 'Return library books'),
    ('Music',    'music',    '🎵', 'Bring instrument')
) AS d("subject", "subjectKey", "emoji", "reminder")
ON CONFLICT ("schoolId", "subjectKey") DO NOTHING;
