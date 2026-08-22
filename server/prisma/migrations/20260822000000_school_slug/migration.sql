-- School.slug: URL slug for branded multi-tenant login (Phase 0).
-- Additive + nullable, so existing rows and queries are unaffected.
ALTER TABLE "School" ADD COLUMN "slug" TEXT;

-- Backfill the pilot school. Env-agnostic: matches by shortName, so it updates
-- 0 rows in any environment that doesn't have VHPS.
UPDATE "School" SET "slug" = 'vhpscoa' WHERE "shortName" = 'VHPS COA' AND "slug" IS NULL;

-- Unique index. In Postgres a UNIQUE index permits multiple NULLs, so schools
-- without a slug yet don't collide.
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");
