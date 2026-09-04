-- The school MIS's attendance figure, mirrored from Hub.
--
-- Hub does not calculate this: a school admin uploads the MIS export and Hub
-- serves the number verbatim. Connect stores and displays it, and calculates
-- nothing from it.
--
-- Both nullable, and NULL means "no figure" — either Hub holds none for this
-- pupil, or our token lacks the `pupils:attendance` scope so we were never
-- told. It does not mean 0%, and nothing may render it as such.
--
-- asOf is TEXT, not a date: it is the date the figure DESCRIBES, stored exactly
-- as Hub sends it (YYYY-MM-DD). Parsing it into a timestamp would invite a
-- timezone shifting a school's attendance figure by a day.
ALTER TABLE "Student" ADD COLUMN "attendancePercentage" DOUBLE PRECISION;
ALTER TABLE "Student" ADD COLUMN "attendanceAsOf" TEXT;
