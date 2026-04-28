-- Student photos
ALTER TABLE "Student" ADD COLUMN "photoUrl" TEXT;

-- Inclusion API keys
CREATE TABLE "InclusionApiKey" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InclusionApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InclusionApiKey_key_key" ON "InclusionApiKey"("key");
CREATE INDEX "InclusionApiKey_schoolId_idx" ON "InclusionApiKey"("schoolId");
ALTER TABLE "InclusionApiKey" ADD CONSTRAINT "InclusionApiKey_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Student IEPs
CREATE TABLE "StudentIep" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "targets" JSONB NOT NULL,
    "reviewDate" TEXT,
    "keyWorker" TEXT,
    "notes" TEXT,
    "parentVisible" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentIep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentIep_studentId_idx" ON "StudentIep"("studentId");
CREATE INDEX "StudentIep_schoolId_idx" ON "StudentIep"("schoolId");
ALTER TABLE "StudentIep" ADD CONSTRAINT "StudentIep_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentIep" ADD CONSTRAINT "StudentIep_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
