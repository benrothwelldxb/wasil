-- Remember that a calendar event moved, and what it moved from.
--
-- Hub pushes calendar.updated and Connect re-syncs immediately, but the sync
-- upserts silently: a parent who wrote the old date down finds the new one and
-- no reason to doubt their memory. These columns let the event itself say
-- "Moved from Tue 14 Oct".
--
-- Only date, time and location are tracked. A corrected typo in a description
-- is not something to tell three hundred families about.
ALTER TABLE "Event" ADD COLUMN "changedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "previousDate" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "previousTime" TEXT;
ALTER TABLE "Event" ADD COLUMN "previousLocation" TEXT;

CREATE INDEX "Event_schoolId_changedAt_idx" ON "Event"("schoolId", "changedAt");
