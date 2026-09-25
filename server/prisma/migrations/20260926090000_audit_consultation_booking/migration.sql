-- The school cancelling a parent's consultation booking is an auditable act.
--
-- The reason the parent was given is stored in the log's metadata: "who
-- cancelled this, and why" is asked weeks later, by which time a verbal
-- explanation has left no record at all.
ALTER TYPE "AuditResourceType" ADD VALUE 'CONSULTATION_BOOKING';
