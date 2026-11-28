-- Parents' corrections to their phone or email, for the office to load into
-- the MIS (as a CSV) — Connect cannot write to Hub. See ContactChangeRequest.
CREATE TABLE "ContactChangeRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "ContactChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactChangeRequest_schoolId_resolvedAt_idx" ON "ContactChangeRequest"("schoolId", "resolvedAt");
CREATE INDEX "ContactChangeRequest_userId_field_idx" ON "ContactChangeRequest"("userId", "field");

ALTER TABLE "ContactChangeRequest" ADD CONSTRAINT "ContactChangeRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactChangeRequest" ADD CONSTRAINT "ContactChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
