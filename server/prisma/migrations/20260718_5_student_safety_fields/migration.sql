-- Per-student safety info (allergies + medical notes) surfaced to activity/club
-- staff, including external providers.
ALTER TABLE "Student" ADD COLUMN "allergies" TEXT;
ALTER TABLE "Student" ADD COLUMN "medicalNotes" TEXT;
