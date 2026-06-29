-- Locale
ALTER TABLE "School" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai';

-- Module enabled flags (all default true)
ALTER TABLE "School" ADD COLUMN "inboxEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "postsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "emergencyAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "formsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "eventsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "weeklyUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "pulseEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "ecaEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "consultationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "schoolServicesEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "lunchMenuEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "termDatesEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "scheduleEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "policiesEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "filesEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "linksEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "knowledgeBaseEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Attendance digest
ALTER TABLE "School" ADD COLUMN "attendanceDigestEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "School" ADD COLUMN "attendanceDigestTime" TEXT;
ALTER TABLE "School" ADD COLUMN "attendanceDigestLastSentDate" TEXT;
