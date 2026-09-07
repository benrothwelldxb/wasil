-- When the evening runs, on the evening itself.
--
-- Slot and break duration already lived on ConsultationEvent, but the start and
-- end times only existed per teacher — so setting up parents' evening meant
-- deciding the times in your head and then typing them once per teacher. They
-- are a property of the evening; a teacher who differs still overrides.
ALTER TABLE "ConsultationEvent" ADD COLUMN "defaultStartTime" TEXT;
ALTER TABLE "ConsultationEvent" ADD COLUMN "defaultEndTime" TEXT;
