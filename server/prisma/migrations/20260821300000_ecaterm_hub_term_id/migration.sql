-- Link an EcaTerm to its Wasil Hub academic term, so the Hub ECA-term sync can
-- find-or-create (keyed on hubTermId) and prune terms Hub dropped. Null for
-- manually-created terms, which the sync never touches. Hub owns the term's
-- identity (name/dates); Connect owns the enrolment workflow (status,
-- registration windows, session-time defaults). Additive + nullable.
ALTER TABLE "EcaTerm" ADD COLUMN "hubTermId" TEXT;

-- A Hub-sourced term is created in DRAFT with no registration window yet — the
-- admin fills these in as part of the Connect workflow — so the columns must be
-- nullable. Dropping NOT NULL is backward-compatible (existing rows keep their
-- values; manual create still supplies them).
ALTER TABLE "EcaTerm" ALTER COLUMN "registrationOpens" DROP NOT NULL;
ALTER TABLE "EcaTerm" ALTER COLUMN "registrationCloses" DROP NOT NULL;
