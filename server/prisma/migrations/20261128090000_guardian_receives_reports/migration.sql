-- Whether the school wants this adult to receive this child's reports.
--
-- Mirrored from Hub's GuardianPupil.receivesReports (Hub PR #258): school-set,
-- per adult-child pair, so a school can send to one separated parent and not
-- the other, or leave out an emergency-only contact. NOT consent.
--
-- Defaults true, as in Hub: every existing link keeps seeing reports exactly
-- as today until the school unticks one. A link Connect made itself (an
-- invitation, an admin) is never touched by Hub and stays true.
ALTER TABLE "ParentStudentLink" ADD COLUMN "receivesReports" BOOLEAN NOT NULL DEFAULT true;
