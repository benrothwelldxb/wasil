-- Group names are unique per school only among groups a school made by hand.
--
-- The full unique was doing two jobs: stopping an admin accidentally creating
-- two "Football" groups, and — unintentionally — stopping any external system
-- publishing a club that runs more than one term. A club called Football in
-- both Autumn and Spring is two groups wanting one name, so publishers mangled
-- them to "Football (Autumn Term)" purely to get past the constraint. That
-- workaround ended up in front of parents.
--
-- A published group is identified by externalRef, which is already unique per
-- school, so it does not need the name to be. A hand-made group has no ref and
-- keeps the guard.
--
-- Prisma cannot express a partial unique index, so this is raw and the schema
-- carries a note warning not to let `migrate dev` recreate the full one.
DROP INDEX "Group_schoolId_name_key";

CREATE UNIQUE INDEX "Group_schoolId_name_manual_key"
  ON "Group"("schoolId", "name")
  WHERE "externalRef" IS NULL;
