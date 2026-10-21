-- A partner broadcast, keyed on the partner's own idempotency key.
--
-- A retry after a lost response must not tell every family twice: "back at
-- school" sent from a phone on a coach is exactly the message that gets
-- retried. The row is claimed before any post is written, so two attempts on
-- one key cannot both send, and it keeps the first response for a repeat.
CREATE TABLE "PartnerMessageSend" (
    "id" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "schoolId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerMessageSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerMessageSend_partner_idempotencyKey_key" ON "PartnerMessageSend"("partner", "idempotencyKey");
