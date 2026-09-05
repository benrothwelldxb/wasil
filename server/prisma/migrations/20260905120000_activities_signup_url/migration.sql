-- Where a parent signs up for a school-run activity.
--
-- Connect displays the programme and does not run the choice — that moved out
-- — so a parent reading the Activities screen needs somewhere to go. Without
-- this the screen is a list they can admire and not join.
ALTER TABLE "School" ADD COLUMN "activitiesSignUpUrl" TEXT;
