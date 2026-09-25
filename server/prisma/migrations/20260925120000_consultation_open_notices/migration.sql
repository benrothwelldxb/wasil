-- Telling parents that booking has opened for them.

-- When this event most recently BECAME open for booking.
--
-- NULL on every existing event, and that is the point: the job that announces
-- an opening only considers recent ones, so deploying it cannot send a
-- notification about an evening that opened weeks ago. A silent deploy is the
-- requirement here, not a nice-to-have — the alternative is every parent in the
-- school being pushed about a consultation they may already have booked.
ALTER TABLE "ConsultationEvent" ADD COLUMN "bookingOpenedAt" TIMESTAMP(3);

-- Who has already been told that booking is open FOR THEM.
--
-- Waves make that a per-family question rather than a per-event one: a family
-- in Year 2 and Year 5 becomes able to book when the Year 2 wave opens, and
-- must not be told again when Year 5 opens — they could already book, and a
-- second push about the same evening reads as a mistake.
--
-- A ledger rather than a flag, because it makes the job idempotent: it can run
-- every five minutes, fail halfway, or be deployed twice, and nobody is told
-- twice.
CREATE TABLE "ConsultationOpenNotice" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationOpenNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationOpenNotice_consultationId_userId_key"
    ON "ConsultationOpenNotice"("consultationId", "userId");
CREATE INDEX "ConsultationOpenNotice_consultationId_idx"
    ON "ConsultationOpenNotice"("consultationId");

ALTER TABLE "ConsultationOpenNotice" ADD CONSTRAINT "ConsultationOpenNotice_consultationId_fkey"
    FOREIGN KEY ("consultationId") REFERENCES "ConsultationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationOpenNotice" ADD CONSTRAINT "ConsultationOpenNotice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
