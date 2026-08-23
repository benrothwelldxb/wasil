-- ILSA (Learning Support Assistant) limited-entity messaging (ADR 0006).
-- Additive only: a new Role value, a new AuditResourceType value, a `kind`
-- discriminator on Conversation (defaulting existing rows to "STAFF"), and the
-- IlsaLink table that mirrors Hub's ILSA↔pupil link into Connect.

-- New enum values. Additive; existing rows/queries are unaffected.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ILSA';
ALTER TYPE "AuditResourceType" ADD VALUE IF NOT EXISTS 'ILSA_THREAD';

-- Thread typing. Every existing Conversation is a STAFF (teacher/office↔parent)
-- thread, so the default backfills them correctly and no query changes meaning
-- until an ILSA thread is created.
ALTER TABLE "Conversation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'STAFF';

-- Oversight retrieval reads ILSA threads for one pupil in a school.
CREATE INDEX "Conversation_schoolId_kind_studentId_idx" ON "Conversation"("schoolId", "kind", "studentId");

-- The ILSA↔pupil scope link (Connect's mirror of Hub's link).
CREATE TABLE "IlsaLink" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hubPupilId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IlsaLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IlsaLink_userId_studentId_key" ON "IlsaLink"("userId", "studentId");
CREATE INDEX "IlsaLink_schoolId_active_idx" ON "IlsaLink"("schoolId", "active");
CREATE INDEX "IlsaLink_studentId_active_idx" ON "IlsaLink"("studentId", "active");

ALTER TABLE "IlsaLink" ADD CONSTRAINT "IlsaLink_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IlsaLink" ADD CONSTRAINT "IlsaLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IlsaLink" ADD CONSTRAINT "IlsaLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
