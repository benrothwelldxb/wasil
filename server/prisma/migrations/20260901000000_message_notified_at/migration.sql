-- When parents were actually told about a message.
ALTER TABLE "Message" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- BACKFILL IS LOAD-BEARING, NOT TIDINESS.
--
-- The sweep that ships with this change looks for `notifiedAt IS NULL AND
-- scheduledAt <= now()`. Every message already in the table would match that on
-- the first tick after deploy — including every scheduled post from months ago,
-- all of which were already announced at creation time under the old behaviour.
-- Without this line, deploying would re-notify the entire back catalogue at once.
--
-- Stamped with createdAt because that IS when parents were told: the old code
-- notified immediately regardless of scheduledAt, which is the bug being fixed.
UPDATE "Message" SET "notifiedAt" = "createdAt";

-- Finding due messages is a small, frequent query; index the pair it filters on.
CREATE INDEX "Message_notifiedAt_scheduledAt_idx" ON "Message"("notifiedAt", "scheduledAt");
