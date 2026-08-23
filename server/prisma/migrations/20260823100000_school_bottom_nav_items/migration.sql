-- School.bottomNavItems: the three admin-chosen middle items of the parent app's
-- bottom tab bar (Home + these 3 + More). JSON array of catalog keys; NULL =
-- the app's default set. Additive + nullable, so existing rows/queries are
-- unaffected and every school falls back to the default until customised.
ALTER TABLE "School" ADD COLUMN "bottomNavItems" JSONB;
