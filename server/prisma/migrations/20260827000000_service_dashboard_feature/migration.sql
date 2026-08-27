-- Promote a school service onto the parent dashboard for a while.
ALTER TABLE "SchoolService" ADD COLUMN IF NOT EXISTS "featuredOnDashboard" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SchoolService" ADD COLUMN IF NOT EXISTS "featuredUntil" TIMESTAMP(3);
