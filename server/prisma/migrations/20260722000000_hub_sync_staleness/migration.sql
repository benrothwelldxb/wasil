-- Wasil Hub MIS sync — school-level staleness + last-sync tracking.
-- Additive only: two nullable timestamps on School, no backfill needed.

-- AlterTable
ALTER TABLE "School" ADD COLUMN "hubLastSyncedAt" TIMESTAMP(3);
ALTER TABLE "School" ADD COLUMN "hubDataStaleSince" TIMESTAMP(3);
