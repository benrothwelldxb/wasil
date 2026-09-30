-- The roster's own version, separate from the catalogue's.
--
-- A club's details and its register change at different rates and on different
-- events. Sharing sourceVersion would make them interfere: a roster update
-- would have to claim a newer catalogue version, and a catalogue retry would be
-- entitled to roll a register back.
ALTER TABLE "EcaActivity" ADD COLUMN "rosterVersion" TIMESTAMP(3);
