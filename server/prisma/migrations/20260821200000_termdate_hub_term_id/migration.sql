-- Link a TermDate row to its Wasil Hub academic term, so the Hub term sync can
-- idempotently upsert (keyed on hubTermId + type) and prune terms Hub dropped.
-- Null for manually-created rows (half-terms / public-holidays / inductions),
-- which the sync never touches. Additive + nullable — safe on a live table.
ALTER TABLE "TermDate" ADD COLUMN "hubTermId" TEXT;
