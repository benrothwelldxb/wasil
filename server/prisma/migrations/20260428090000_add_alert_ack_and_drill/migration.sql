ALTER TABLE "EmergencyAlert" ADD COLUMN "isDrill" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmergencyAlert" ADD COLUMN "drillName" TEXT;
ALTER TABLE "EmergencyAlert" ADD COLUMN "requireAck" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AlertAcknowledgment" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertAcknowledgment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertAcknowledgment_alertId_parentId_key" ON "AlertAcknowledgment"("alertId", "parentId");
CREATE INDEX "AlertAcknowledgment_alertId_idx" ON "AlertAcknowledgment"("alertId");
ALTER TABLE "AlertAcknowledgment" ADD CONSTRAINT "AlertAcknowledgment_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "EmergencyAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertAcknowledgment" ADD CONSTRAINT "AlertAcknowledgment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
