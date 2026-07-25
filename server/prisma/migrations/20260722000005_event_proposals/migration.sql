-- Teacher event proposals (Stage 4 / Phase B). A proposal is an ordinary Event
-- with `proposalStatus = 'PENDING'` and no `hubCalendarEventId` yet, so it
-- already renders to parents via the multi-target visibility query. When Hub
-- approves it, the synced CalendarEvent adopts this row (sets hubCalendarEventId,
-- clears proposalStatus). Additive columns only; no backfill.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "hubProposalId" TEXT;
ALTER TABLE "Event" ADD COLUMN "proposalStatus" TEXT;
ALTER TABLE "Event" ADD COLUMN "submittedByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_hubProposalId_key" ON "Event"("hubProposalId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
