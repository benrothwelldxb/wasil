-- Add performance indexes for frequently queried fields

-- Message: school listing with date sort, class/yearGroup filtering
CREATE INDEX IF NOT EXISTS "Message_schoolId_createdAt_idx" ON "Message"("schoolId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_classId_idx" ON "Message"("classId");
CREATE INDEX IF NOT EXISTS "Message_yearGroupId_idx" ON "Message"("yearGroupId");

-- Form: admin listing filtered by school and status
CREATE INDEX IF NOT EXISTS "Form_schoolId_status_idx" ON "Form"("schoolId", "status");

-- Event: calendar queries filtered by school and date
CREATE INDEX IF NOT EXISTS "Event_schoolId_date_idx" ON "Event"("schoolId", "date");

-- MagicLinkToken: lookup by email + type (replaces email-only index)
DROP INDEX IF EXISTS "MagicLinkToken_email_idx";
CREATE INDEX IF NOT EXISTS "MagicLinkToken_email_type_idx" ON "MagicLinkToken"("email", "type");
