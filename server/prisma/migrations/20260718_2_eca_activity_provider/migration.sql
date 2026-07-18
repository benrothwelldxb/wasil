-- Tag ECA activities with an owning external provider (null = school-run) and
-- an external payment link for paid provider clubs.
ALTER TABLE "EcaActivity" ADD COLUMN "providerId" TEXT;
ALTER TABLE "EcaActivity" ADD COLUMN "paymentUrl" TEXT;

CREATE INDEX "EcaActivity_providerId_idx" ON "EcaActivity"("providerId");

ALTER TABLE "EcaActivity" ADD CONSTRAINT "EcaActivity_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
