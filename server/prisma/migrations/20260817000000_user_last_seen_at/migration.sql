-- Precise active-user tracking for launch analytics. Stamped (throttled,
-- fire-and-forget) by the isAuthenticated middleware on any authenticated
-- request. Additive + nullable so it is safe to apply to a live table with no
-- backfill; the analytics "activated" definition falls back to RefreshToken /
-- consumed LoginCode history for parents who authenticated before this shipped.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
