-- A messaging group whose membership belongs to a school service.
--
-- "Broadcast to everyone in aftercare" was only possible by maintaining a group
-- by hand against a list that changes weekly. These columns mark a group as
-- derived from a service's CONFIRMED registrations, optionally narrowed to one
-- year group — because message targeting takes a single audience, so
-- "Foundation Stage aftercare" has to be the group rather than the send.
--
-- Membership is recomputed when the group is used, not maintained on write:
-- registrations change in nine places including the partner API, and a group
-- that is quietly stale is worse than none.
ALTER TABLE "Group" ADD COLUMN "sourceServiceId" TEXT;
ALTER TABLE "Group" ADD COLUMN "sourceYearGroupId" TEXT;

CREATE INDEX "Group_sourceServiceId_idx" ON "Group"("sourceServiceId");

ALTER TABLE "Group" ADD CONSTRAINT "Group_sourceServiceId_fkey"
  FOREIGN KEY ("sourceServiceId") REFERENCES "SchoolService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Group" ADD CONSTRAINT "Group_sourceYearGroupId_fkey"
  FOREIGN KEY ("sourceYearGroupId") REFERENCES "YearGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
