-- The Google Calendar event behind a booking's Meet link.
--
-- Cancelling a booking could not cancel the meeting, because the event id was
-- returned by the Calendar API and thrown away. The appointment stayed in the
-- teacher's and the parent's calendars with a link that still worked.
--
-- Null on every existing booking, and it stays null: the events are real but
-- their ids were never kept, so those cannot be cleaned up automatically. Only
-- bookings made from here can be.
ALTER TABLE "ConsultationBooking" ADD COLUMN "meetingEventId" TEXT;
