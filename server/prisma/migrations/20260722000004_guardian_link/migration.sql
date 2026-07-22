-- Guardian → parent provisioning (Stage 2). `hubGuardianId` is the idempotency
-- key for a Connect PARENT account provisioned from a Hub guardian, so re-running
-- the sync updates the same account instead of duplicating it. Additive column
-- only; no backfill (Hub currently holds 0 guardians).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "hubGuardianId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_hubGuardianId_key" ON "User"("hubGuardianId");
