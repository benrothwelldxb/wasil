-- Track when an admin last sent a parent the "you've been added" welcome email
-- (the passwordless sign-in nudge). Null = never invited; additive + nullable so
-- it is safe to apply to a live table with no backfill.
ALTER TABLE "User" ADD COLUMN "welcomeSentAt" TIMESTAMP(3);
