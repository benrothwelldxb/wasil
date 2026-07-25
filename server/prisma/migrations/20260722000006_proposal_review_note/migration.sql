-- Rejection feedback for teacher event proposals (Stage 4 / Phase B).
-- Hub's `calendar.proposal_reviewed` webhook carries a reason on REJECTED; we
-- store it so the submitting teacher sees why. Additive, nullable — no backfill.
ALTER TABLE "Event" ADD COLUMN "proposalReviewNote" TEXT;
