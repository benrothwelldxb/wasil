-- Forms answered once per CHILD, and forms a partner app publishes.
--
-- A trip consent form is a decision about one pupil, but FormResponse was
-- unique on (formId, userId): a parent of twins on the trip could answer only
-- once, and nothing recorded which child an answer was for. Per-child answers
-- carry studentId and are unique on (formId, studentId), so either linked
-- guardian may answer for a child and the latest answer stands.
--
-- An ordinary form is still answered once per parent. That rule moves to a
-- PARTIAL unique index, because Prisma cannot express one and a plain unique on
-- (formId, userId) would stop a parent answering for a second child. The
-- schema carries a note warning not to let `migrate dev` recreate it.
ALTER TABLE "FormResponse" ADD COLUMN "studentId" TEXT;

DROP INDEX "FormResponse_formId_userId_key";
CREATE UNIQUE INDEX "FormResponse_formId_userId_parent_key"
  ON "FormResponse"("formId", "userId")
  WHERE "studentId" IS NULL;
-- When the current answer was given. Existing answers were never changed, so
-- their answer time is their creation time.
ALTER TABLE "FormResponse" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "FormResponse" SET "updatedAt" = "createdAt";

CREATE UNIQUE INDEX "FormResponse_formId_studentId_key" ON "FormResponse"("formId", "studentId");
-- The partner read of answers pages forwards on this.
CREATE INDEX "FormResponse_formId_updatedAt_idx" ON "FormResponse"("formId", "updatedAt");

-- Cascade: a pupil removed from the school takes their answers with them, as
-- their group memberships already go.
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A form a partner publishes: its own ref (unique per school), its owner, and
-- whether it is answered per child.
ALTER TABLE "Form" ADD COLUMN "perChild" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Form" ADD COLUMN "externalRef" TEXT;
ALTER TABLE "Form" ADD COLUMN "managedBy" TEXT;
CREATE UNIQUE INDEX "Form_schoolId_externalRef_key" ON "Form"("schoolId", "externalRef");
