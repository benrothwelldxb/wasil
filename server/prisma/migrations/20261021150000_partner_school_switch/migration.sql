-- Wasil Beyond is off for every school until a school admin turns it on in
-- Connect's settings. While off, Beyond's token may not write anything that
-- reaches parents, and what it already wrote is hidden from them.
ALTER TABLE "School" ADD COLUMN "beyondEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Which partner token sent a post, so a post Beyond addressed to pupils or a
-- class (no managed group) can still be recognised as Beyond's.
ALTER TABLE "Message" ADD COLUMN "partnerSource" TEXT;
