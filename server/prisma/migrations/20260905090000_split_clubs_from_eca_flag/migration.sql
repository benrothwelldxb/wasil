-- Paid provider-run clubs get their own module flag, separate from the
-- school's own ECA.
--
-- Both live in EcaActivity and both hung off `ecaEnabled`, so a school turning
-- off its own after-school activities would also have removed the clubs page
-- from the parent menu — including for parents who had already booked and paid
-- through it. Those are different decisions and now have different switches.
--
-- Defaults to true, and is backfilled from ecaEnabled, so no school's menu
-- changes on deploy: a school with ECA off today keeps clubs off until it says
-- otherwise, rather than having a page appear unannounced.
ALTER TABLE "School" ADD COLUMN "clubsEnabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "School" SET "clubsEnabled" = "ecaEnabled";
