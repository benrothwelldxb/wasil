-- EcaActivity.isPublished: provider-controlled "Show on parent app" flag.
-- Parents only ever see published activities; admins and the owning provider
-- see all. Additive column, defaults false (existing activities become
-- unpublished — acceptable pre-production; pilot school has 0 activities).
ALTER TABLE "EcaActivity" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
