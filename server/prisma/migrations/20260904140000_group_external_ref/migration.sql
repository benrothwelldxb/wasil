-- The publishing system's own id for a contact group.
--
-- Group is unique on (schoolId, name), which is right for groups a school makes
-- by hand but wrong for one published by another system: re-publishing the same
-- roster collided, so callers mangled names — "Football (Autumn Term)" — purely
-- to stay unique. An external ref makes the write idempotent and lets the name
-- be whatever the school should actually read.
--
-- Nullable, and unique only among non-null values: Postgres treats NULLs as
-- distinct in a unique index, so any number of hand-made groups coexist.
ALTER TABLE "Group" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Group_schoolId_externalRef_key" ON "Group"("schoolId", "externalRef");
