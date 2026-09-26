-- When the school last chased a family about a consultation.
--
-- Separate from ConsultationOpenNotice, which records the one-off "booking is
-- open for you now". A nudge is REPEATABLE — a school chases, waits, chases
-- again — so this holds a moving timestamp and a count rather than being a
-- one-way ledger. "We have asked this family three times" is a different
-- conversation from "we have asked once", and by the week of the evening
-- somebody will want to know which.
CREATE TABLE "ConsultationNudge" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastNudgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ConsultationNudge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationNudge_consultationId_userId_key"
    ON "ConsultationNudge"("consultationId", "userId");
CREATE INDEX "ConsultationNudge_consultationId_idx" ON "ConsultationNudge"("consultationId");

ALTER TABLE "ConsultationNudge" ADD CONSTRAINT "ConsultationNudge_consultationId_fkey"
    FOREIGN KEY ("consultationId") REFERENCES "ConsultationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationNudge" ADD CONSTRAINT "ConsultationNudge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
