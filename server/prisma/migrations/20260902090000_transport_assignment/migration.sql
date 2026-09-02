-- A child's bus arrangement, pushed from Desk (Desk ADR 0008, Connect ADR 0001).
--
-- Deliberately flat. Routes and stops are NOT modelled as entities: because the
-- school collects door-to-door, a stop table would be a queryable directory of
-- the home address of every child in the school. One row per (student, leg)
-- means an address exists only as many times as children are collected from it,
-- and there is no shape to enumerate.
--
-- No `active` column, by design. The push is a full replacement per leg and
-- deletes what is absent: a soft-deleted row here is a retained child's home
-- address wearing a disguise, and the flag would defeat that the first time
-- someone wrote `where active = true` without knowing why it was there.
CREATE TYPE "TransportLeg" AS ENUM ('AM', 'PM');

CREATE TABLE "TransportAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "leg" "TransportLeg" NOT NULL,
    "routeName" TEXT NOT NULL,
    "routeCode" TEXT,
    "stopName" TEXT NOT NULL,
    "timeLocal" TEXT NOT NULL,
    "hideStopName" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransportAssignment_studentId_leg_key" ON "TransportAssignment"("studentId", "leg");
CREATE INDEX "TransportAssignment_schoolId_leg_idx" ON "TransportAssignment"("schoolId", "leg");

ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CASCADE, not SET NULL: a child who leaves the school takes their home address
-- with them. This is the retention rule, expressed as a constraint.
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
