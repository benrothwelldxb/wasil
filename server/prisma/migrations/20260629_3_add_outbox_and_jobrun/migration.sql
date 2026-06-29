-- Outbox kind / status enums
CREATE TYPE "OutboxKind" AS ENUM ('EMAIL', 'PUSH');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- Outbox table: reliable email + push delivery queue
CREATE TABLE "OutboxEntry" (
  "id"        TEXT NOT NULL,
  "schoolId"  TEXT NOT NULL,
  "kind"      "OutboxKind" NOT NULL,
  "payload"   JSONB NOT NULL,
  "status"    "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"  INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "runAfter"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"    TIMESTAMP(3),
  "failedAt"  TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboxEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboxEntry_status_runAfter_idx" ON "OutboxEntry"("status", "runAfter");
CREATE INDEX "OutboxEntry_schoolId_idx" ON "OutboxEntry"("schoolId");

ALTER TABLE "OutboxEntry" ADD CONSTRAINT "OutboxEntry_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- JobRun table: per-(jobKey, periodKey) idempotency for cron jobs
CREATE TABLE "JobRun" (
  "id"          TEXT NOT NULL,
  "jobKey"      TEXT NOT NULL,
  "periodKey"   TEXT NOT NULL,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "succeeded"   BOOLEAN NOT NULL DEFAULT false,
  "error"       TEXT,
  CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobRun_jobKey_periodKey_key" ON "JobRun"("jobKey", "periodKey");
CREATE INDEX "JobRun_jobKey_startedAt_idx" ON "JobRun"("jobKey", "startedAt");
