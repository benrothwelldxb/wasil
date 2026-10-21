-- The publisher's clock for a group's full roster.
--
-- PUT /api/partner/groups/:ref/roster replaces a group's membership and
-- applies only when its version is strictly newer than the last one accepted,
-- so a retry delivered out of order cannot put back a family a later push
-- removed. Null until the first push.
ALTER TABLE "Group" ADD COLUMN "rosterVersion" TIMESTAMP(3);
