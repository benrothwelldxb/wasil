ALTER TABLE "Event" ADD COLUMN "parentEventId" TEXT;
ALTER TABLE "Event" ADD COLUMN "recurrenceType" TEXT;
CREATE INDEX "Event_parentEventId_idx" ON "Event"("parentEventId");
