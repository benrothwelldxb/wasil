-- Admin Notices: messages from a school department (clinic, accounts) that are
-- kept out of the parent feed and filed in their own section.
--
-- Same Message row as an ordinary post, so targeting, scheduling, expiry,
-- attachments, attached forms and acknowledgement all still apply. Only where
-- it surfaces differs.
--
-- Every existing message defaults to FEED, so nothing moves and there is no
-- backfill: the feed keeps showing exactly what it showed yesterday.
CREATE TYPE "MessageChannel" AS ENUM ('FEED', 'ADMIN_NOTICE');

ALTER TABLE "Message" ADD COLUMN "channel" "MessageChannel" NOT NULL DEFAULT 'FEED';
ALTER TABLE "Message" ADD COLUMN "department" TEXT;

-- Both parent reads filter on this pair: the feed excludes notices, the notices
-- section selects only them.
CREATE INDEX "Message_schoolId_channel_idx" ON "Message"("schoolId", "channel");

-- When a parent last opened Admin Notices; the homepage bar counts notices
-- newer than this. NULL means never opened, so everything is new.
ALTER TABLE "User" ADD COLUMN "noticesLastSeenAt" TIMESTAMP(3);
