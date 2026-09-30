-- Emailing a weekly update, and knowing when it landed.

-- Off by default and chosen per update, not per school: a principal's weekly
-- round-up and a "the boiler is fixed" note are not the same thing, and
-- emailing every family about the second is how a school teaches people to
-- filter the first.
ALTER TABLE "WeeklyMessage" ADD COLUMN "emailToParents" BOOLEAN NOT NULL DEFAULT false;

-- When it actually reached parents.
--
-- "New" cannot be derived from createdAt once updates can be scheduled: one
-- written on Thursday for Monday is new on MONDAY. The dashboard promotes an
-- update to the top for a few days from this moment, not from when it was
-- typed.
ALTER TABLE "WeeklyMessage" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Backfilled from createdAt for everything already sent. Every existing update
-- was published the moment it was written — scheduling came later — so this is
-- the true value rather than a convenient one.
UPDATE "WeeklyMessage" SET "publishedAt" = "createdAt" WHERE "scheduledAt" IS NULL;
UPDATE "WeeklyMessage" SET "publishedAt" = "scheduledAt" WHERE "scheduledAt" IS NOT NULL;
