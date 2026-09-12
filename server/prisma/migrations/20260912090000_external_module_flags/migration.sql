-- Per-school switches for the integrations that read from another Wasil app.
--
-- DEFAULT FALSE, unlike every other module flag on this table. The rest gate
-- Connect's own features, which ship working; these two reach across an app
-- boundary to a system with its own release cycle, so the code being merged and
-- the feature being ready for families are different dates. A school gets them
-- when someone decides they do.
--
-- These are also enforced on the route, not only in the navigation — see
-- middleware/moduleFlag.ts. Off means the endpoint 404s.
ALTER TABLE "School" ADD COLUMN "activeScheduleEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "School" ADD COLUMN "sendInclusionEnabled"  BOOLEAN NOT NULL DEFAULT false;
