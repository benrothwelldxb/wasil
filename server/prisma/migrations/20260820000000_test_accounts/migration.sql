-- "Test Student" backdoor accounts into the LIVE parent experience, per class.
-- A flagged Test Parent (User.isTest) signs in with a fixed env-gated code and
-- sees the real, live parent app for a flagged Test Student (Student.isTest)
-- enrolled in a real class. Both flags exist ONLY to (a) exclude these accounts
-- from every staff/admin enumeration + all launch analytics/counts, and (b) keep
-- delivery (class-targeted content/comms) reaching the test parent. Additive +
-- NOT NULL with a default, so it is safe to apply to live tables with no
-- backfill (every existing row becomes isTest = false).
ALTER TABLE "User" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Student" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
