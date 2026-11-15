-- Report delivery from other Wasil apps (CP-1).
--
-- Little Things (EYFS) and Class Passport (Years 1-6) hand a child's report to
-- Connect, keyed on their own (sourceApp, sourceReportId) and versioned by the
-- report's own counter. publishAt holds a report back from parents until its
-- time; notifiedAt is the claim the release sweep takes when it tells them.
--
-- uploadedById becomes nullable: a delivered report has no uploading person.
ALTER TABLE "StudentReport" ALTER COLUMN "uploadedById" DROP NOT NULL;

ALTER TABLE "StudentReport" ADD COLUMN "title" TEXT;
ALTER TABLE "StudentReport" ADD COLUMN "sourceApp" TEXT;
ALTER TABLE "StudentReport" ADD COLUMN "sourceReportId" TEXT;
ALTER TABLE "StudentReport" ADD COLUMN "version" INTEGER;
ALTER TABLE "StudentReport" ADD COLUMN "managedBy" TEXT;
ALTER TABLE "StudentReport" ADD COLUMN "publishAt" TIMESTAMP(3);
ALTER TABLE "StudentReport" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- NULLs are distinct in Postgres, so admin uploads (both null) never collide.
CREATE UNIQUE INDEX "StudentReport_schoolId_sourceApp_sourceReportId_key" ON "StudentReport"("schoolId", "sourceApp", "sourceReportId");
CREATE INDEX "StudentReport_publishAt_idx" ON "StudentReport"("publishAt");

ALTER TABLE "NotificationPreference" ADD COLUMN "reports" BOOLEAN NOT NULL DEFAULT true;
