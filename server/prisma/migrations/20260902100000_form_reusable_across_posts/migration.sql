-- A form can go on more than one post.
--
-- Message.formId was UNIQUE, which made a form usable exactly once, forever.
-- That blocked the ordinary case — a reminder post carrying the same consent
-- form — and, less obviously, meant a form sent to one year group could never
-- be sent to another.
--
-- Dropping a unique index only relaxes a constraint: every existing row still
-- satisfies the looser rule, so this is safe to apply to live data and needs
-- no backfill. The column keeps its plain index for lookups.
DROP INDEX "Message_formId_key";
CREATE INDEX "Message_formId_idx" ON "Message"("formId");
