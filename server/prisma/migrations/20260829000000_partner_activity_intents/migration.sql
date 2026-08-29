-- CreateTable
CREATE TABLE "PartnerIntent" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "hubSchoolId" TEXT NOT NULL,
    "hubPupilId" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "schoolId" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerIntent_idempotencyKey_key" ON "PartnerIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PartnerIntent_status_createdAt_idx" ON "PartnerIntent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerIntent_hubSchoolId_createdAt_idx" ON "PartnerIntent"("hubSchoolId", "createdAt");
