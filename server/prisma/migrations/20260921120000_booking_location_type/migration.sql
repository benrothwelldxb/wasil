-- What THIS parent chose, where the teacher offers in-person or Google Meet.
--
-- Nullable, and null is meaningful rather than missing: it means "inherit the
-- teacher's locationType", which is every booking made before the choice
-- existed and every booking with a teacher who does not offer one. Backfilling
-- it from the teacher would freeze a decision that was never taken, and would
-- be wrong the moment a teacher changed rooms.
ALTER TABLE "ConsultationBooking" ADD COLUMN "locationType" TEXT;
