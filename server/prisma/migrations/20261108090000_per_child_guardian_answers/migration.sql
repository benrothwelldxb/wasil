-- Each guardian's own answer on a per-child form, and which question on a
-- partner consent form is the consent.
--
-- A per-child form kept ONE answer per child (FormResponse, unique on formId +
-- studentId), so the second guardian to answer replaced the first. In the
-- parent app the first answer closed the form for the other guardian. Either
-- way one parent's answer was lost: a first "No" meant the other parent could
-- never say yes, and the trip lost a child the school's policy says may go.
--
-- FormGuardianAnswer keeps every guardian's own answer. FormResponse stays as
-- the answer that stands for the child, so the partner read is unchanged in
-- shape. On a form with consentFieldId set, one guardian's Yes stands;
-- otherwise the latest answer does, as before.
ALTER TABLE "Form" ADD COLUMN "consentFieldId" TEXT;

CREATE TABLE "FormGuardianAnswer" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormGuardianAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FormGuardianAnswer_userId_idx" ON "FormGuardianAnswer"("userId");
CREATE UNIQUE INDEX "FormGuardianAnswer_formId_studentId_userId_key" ON "FormGuardianAnswer"("formId", "studentId", "userId");

ALTER TABLE "FormGuardianAnswer" ADD CONSTRAINT "FormGuardianAnswer_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormGuardianAnswer" ADD CONSTRAINT "FormGuardianAnswer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormGuardianAnswer" ADD CONSTRAINT "FormGuardianAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the answer standing for each child today is the only guardian
-- answer still on record. Any answer it replaced earlier is gone and cannot be
-- recovered. The row's own id is reused: it is unique and already a cuid.
INSERT INTO "FormGuardianAnswer" ("id", "formId", "studentId", "userId", "answers", "createdAt", "updatedAt")
SELECT "id", "formId", "studentId", "userId", "answers", "createdAt", "updatedAt"
FROM "FormResponse"
WHERE "studentId" IS NOT NULL;
