-- School.lastHubSyncAt: timestamp of the last successful Hub roster sync.
-- Additive column; nullable, no backfill.
ALTER TABLE "School" ADD COLUMN "lastHubSyncAt" TIMESTAMP(3);
