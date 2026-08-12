-- Sprint 1 auth hardening: distributed rate-limit store + auth audit trail,
-- plus a cleanup index on LoginCode.expiresAt.

-- Distributed, multi-instance-safe rate-limit counters (fixed window).
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- Authentication audit trail (no FKs — writes never block the auth path and
-- rows outlive deleted users). Never stores codes or hashes.
CREATE TABLE "AuthEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "schoolId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthEvent_email_createdAt_idx" ON "AuthEvent"("email", "createdAt");
CREATE INDEX "AuthEvent_userId_createdAt_idx" ON "AuthEvent"("userId", "createdAt");
CREATE INDEX "AuthEvent_event_createdAt_idx" ON "AuthEvent"("event", "createdAt");
CREATE INDEX "AuthEvent_createdAt_idx" ON "AuthEvent"("createdAt");

-- Cleanup-sweep index for expired login codes.
CREATE INDEX "LoginCode_expiresAt_idx" ON "LoginCode"("expiresAt");
