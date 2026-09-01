-- Where a parent collects their child after a school service.
--
-- Distinct from `location`, which is where the service runs: Homework Club
-- happens in the library but the children come out of the side gate, and it is
-- the gate the parent needs at 16:30.
--
-- Nullable, no backfill. NULL means "not stated", and the parent app shows
-- nothing rather than guessing that it is the same as the run location.
ALTER TABLE "SchoolService" ADD COLUMN "collectionLocation" TEXT;
