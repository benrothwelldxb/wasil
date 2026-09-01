-- The company that actually runs a club, as distinct from the booking partner
-- who organises it. "3-52 Football" run through "Infinite Sports": the partner
-- takes the payment, the operator is the brand parents recognise.
--
-- Purely additive. Every existing club gets operatorId NULL, which the parent
-- card reads as "no operator, fall back to the provider name" — exactly the
-- behaviour today, so nothing changes for anyone until a partner fills it in.
CREATE TABLE "ClubOperator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubOperator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubOperator_providerId_name_key" ON "ClubOperator"("providerId", "name");
CREATE INDEX "ClubOperator_providerId_idx" ON "ClubOperator"("providerId");

ALTER TABLE "ClubOperator" ADD CONSTRAINT "ClubOperator_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EcaActivity" ADD COLUMN "operatorId" TEXT;
CREATE INDEX "EcaActivity_operatorId_idx" ON "EcaActivity"("operatorId");

-- SET NULL, not CASCADE: removing an operator must never delete the clubs that
-- referenced it, along with their bookings.
ALTER TABLE "EcaActivity" ADD CONSTRAINT "EcaActivity_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "ClubOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
