-- When booking opens for one year group.
--
-- Optional and additive: an event with no rows here opens to everybody the
-- moment its status becomes BOOKING_OPEN, which is what every existing event
-- does and continues to do. Windows narrow within that rather than replacing
-- it — the event must still be open at all.
CREATE TABLE "ConsultationBookingWindow" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "yearGroupId" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationBookingWindow_pkey" PRIMARY KEY ("id")
);

-- One window per year group per event: two would be a contradiction about
-- when that year may begin.
CREATE UNIQUE INDEX "ConsultationBookingWindow_consultationId_yearGroupId_key"
    ON "ConsultationBookingWindow"("consultationId", "yearGroupId");

CREATE INDEX "ConsultationBookingWindow_consultationId_idx"
    ON "ConsultationBookingWindow"("consultationId");

ALTER TABLE "ConsultationBookingWindow" ADD CONSTRAINT "ConsultationBookingWindow_consultationId_fkey"
    FOREIGN KEY ("consultationId") REFERENCES "ConsultationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultationBookingWindow" ADD CONSTRAINT "ConsultationBookingWindow_yearGroupId_fkey"
    FOREIGN KEY ("yearGroupId") REFERENCES "YearGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
