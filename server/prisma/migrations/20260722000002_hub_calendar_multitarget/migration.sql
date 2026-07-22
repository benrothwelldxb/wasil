-- Stage 4 / Phase A — Hub calendar → Connect, and multi-target Events.
--
-- Additive + safe: adds one link column to Event, one cursor column to School,
-- and a new EventTarget table. Existing Event columns are untouched (no drops /
-- alters), so this is safe to `prisma migrate deploy` on the live prod DB.
--
-- Multi-target model: an Event's visibility now lives in EventTarget rows (one
-- per targeted class or year-group). ZERO rows + targetClass = 'Whole School'
-- means whole-school. The legacy scalar Event.classId / Event.yearGroupId /
-- Event.groupId columns are kept for backward compatibility; the backfill below
-- seeds EventTarget rows for every existing class/year-group-scoped event so the
-- new join-based query path sees legacy events too.

-- AlterTable — mirror of Hub's CalendarEvent id; presence = read-only marker.
ALTER TABLE "Event" ADD COLUMN "hubCalendarEventId" TEXT;

-- AlterTable — persisted /calendar/changes cursor per school.
ALTER TABLE "School" ADD COLUMN "hubCalendarCursor" INTEGER;

-- CreateTable
CREATE TABLE "EventTarget" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "classId" TEXT,
    "yearGroupId" TEXT,

    CONSTRAINT "EventTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_hubCalendarEventId_key" ON "Event"("hubCalendarEventId");

-- CreateIndex
CREATE INDEX "EventTarget_eventId_idx" ON "EventTarget"("eventId");

-- CreateIndex
CREATE INDEX "EventTarget_classId_idx" ON "EventTarget"("classId");

-- CreateIndex
CREATE INDEX "EventTarget_yearGroupId_idx" ON "EventTarget"("yearGroupId");

-- AddForeignKey
ALTER TABLE "EventTarget" ADD CONSTRAINT "EventTarget_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTarget" ADD CONSTRAINT "EventTarget_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTarget" ADD CONSTRAINT "EventTarget_yearGroupId_fkey" FOREIGN KEY ("yearGroupId") REFERENCES "YearGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill — every existing Event with a non-null classId gets a matching
-- class-scoped EventTarget row. Idempotent via NOT EXISTS so a re-run is a
-- no-op. Whole-school / group-only events get no EventTarget rows.
INSERT INTO "EventTarget" ("id", "eventId", "classId", "yearGroupId")
SELECT gen_random_uuid()::text, e."id", e."classId", NULL
FROM "Event" e
WHERE e."classId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EventTarget" t
    WHERE t."eventId" = e."id" AND t."classId" = e."classId"
  );

-- Backfill — every existing Event with a non-null yearGroupId gets a matching
-- year-group-scoped EventTarget row. Idempotent via NOT EXISTS.
INSERT INTO "EventTarget" ("id", "eventId", "classId", "yearGroupId")
SELECT gen_random_uuid()::text, e."id", NULL, e."yearGroupId"
FROM "Event" e
WHERE e."yearGroupId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "EventTarget" t
    WHERE t."eventId" = e."id" AND t."yearGroupId" = e."yearGroupId"
  );
