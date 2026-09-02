-- Which school contacts sit above the fold in the parent app, rather than
-- inside the collapsed "Other staff" section.
--
-- A flag rather than matching on the name at render time: "Reception" is one
-- school's vocabulary and the next one says "Front Office", and a parent app
-- that hardcodes either is wrong somewhere.
ALTER TABLE "SchoolContact" ADD COLUMN "alwaysVisible" BOOLEAN NOT NULL DEFAULT false;

-- One-time backfill so the new layout is right on the day it ships rather than
-- after someone remembers to curate it. A heuristic, and deliberately confined
-- to this migration — it is a guess about existing data, not a rule the app
-- applies. Admins can change any of it from the contact editor afterwards.
UPDATE "SchoolContact"
SET "alwaysVisible" = true
WHERE "archived" = false
  AND ("name" ILIKE '%reception%' OR "name" ILIKE '%front office%' OR "name" ILIKE '%school office%');
