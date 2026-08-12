-- Resend email delivery events (delivered/opened/bounced/…), keyed by recipient.
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailEvent_email_createdAt_idx" ON "EmailEvent"("email", "createdAt");
CREATE INDEX "EmailEvent_type_createdAt_idx" ON "EmailEvent"("type", "createdAt");
