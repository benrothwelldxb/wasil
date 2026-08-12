-- Beta operations & support tooling: feature flags, feedback, announcements,
-- impersonation sessions.

CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "description" TEXT,
    "enabledDefault" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "FeatureFlagOverride" (
    "id" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "schoolId" TEXT,
    "userId" TEXT,
    "enabled" BOOLEAN NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeatureFlagOverride_flagKey_schoolId_key" ON "FeatureFlagOverride"("flagKey", "schoolId");
CREATE UNIQUE INDEX "FeatureFlagOverride_flagKey_userId_key" ON "FeatureFlagOverride"("flagKey", "userId");
CREATE INDEX "FeatureFlagOverride_schoolId_idx" ON "FeatureFlagOverride"("schoolId");
CREATE INDEX "FeatureFlagOverride_userId_idx" ON "FeatureFlagOverride"("userId");
ALTER TABLE "FeatureFlagOverride" ADD CONSTRAINT "FeatureFlagOverride_flagKey_fkey"
    FOREIGN KEY ("flagKey") REFERENCES "FeatureFlag"("key") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "schoolId" TEXT,
    "message" TEXT NOT NULL,
    "screen" TEXT,
    "url" TEXT,
    "appVersion" TEXT,
    "userAgent" TEXT,
    "consoleLogs" TEXT,
    "screenshotUrl" TEXT,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Feedback_schoolId_createdAt_idx" ON "Feedback"("schoolId", "createdAt");
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'info',
    "level" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Announcement_active_startsAt_endsAt_idx" ON "Announcement"("active", "startsAt", "endsAt");
CREATE INDEX "Announcement_schoolId_idx" ON "Announcement"("schoolId");

CREATE TABLE "ImpersonationSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "schoolId" TEXT,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImpersonationSession_adminId_startedAt_idx" ON "ImpersonationSession"("adminId", "startedAt");
CREATE INDEX "ImpersonationSession_targetUserId_startedAt_idx" ON "ImpersonationSession"("targetUserId", "startedAt");
