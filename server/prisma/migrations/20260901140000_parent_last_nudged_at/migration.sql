-- When an admin last chased a parent who had never signed in.
--
-- Kept apart from "welcomeSentAt" deliberately: that column records the
-- "you've been added" welcome, and many parents were let in by a sign-in code
-- read out in person, never having been sent one. Folding the two together
-- would make "we have chased this person" unanswerable.
--
-- Nullable with no default and no backfill: NULL reads as "never nudged",
-- which is true of everyone at the moment this ships.
ALTER TABLE "User" ADD COLUMN "lastNudgedAt" TIMESTAMP(3);
