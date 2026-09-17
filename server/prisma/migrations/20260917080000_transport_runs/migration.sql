-- Buses become a school-controlled module, and a bus can be marked away.
--
-- `transportEnabled` defaults FALSE, unlike the older module flags which
-- default TRUE. A stop name is in practice a child's home address (ADR 0001),
-- so a school that has not asked for transport should not have it appear in its
-- parent app — and Desk pushing a roster must never be what turns it on. Every
-- existing school therefore starts with buses hidden, including any already
-- receiving pushes; that is deliberate, not a migration oversight.
ALTER TABLE "School" ADD COLUMN "transportEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Desk's route id, carried so a run can be joined to the children on that bus.
-- Desk has always sent it; Connect did not read it until runs needed a key.
-- Nullable: rows written before this exist, and a run simply will not match
-- them until the next full push rewrites the leg.
ALTER TABLE "TransportAssignment" ADD COLUMN "routeId" TEXT;

-- One bus, one leg, one day. No child is named here: a run is a property of a
-- bus, and who was on it is the assignment table's business, joined at read
-- time. `dueAt` is nullable because recording an expected time is optional in
-- Desk, and where there is none there is no lateness to state.
CREATE TABLE "TransportRun" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "leg" "TransportLeg" NOT NULL,
    "dateLocal" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRun_pkey" PRIMARY KEY ("id")
);

-- The same uniqueness Desk's own table has, so the office re-marking after a
-- correction overwrites rather than duplicating.
CREATE UNIQUE INDEX "TransportRun_schoolId_routeId_leg_dateLocal_key"
    ON "TransportRun"("schoolId", "routeId", "leg", "dateLocal");

CREATE INDEX "TransportRun_schoolId_dateLocal_idx"
    ON "TransportRun"("schoolId", "dateLocal");

ALTER TABLE "TransportRun" ADD CONSTRAINT "TransportRun_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
