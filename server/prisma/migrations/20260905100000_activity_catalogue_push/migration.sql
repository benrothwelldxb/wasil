-- An activity can be published into Connect by an outside system, and can meet
-- more than once a week.
--
-- `source` + `externalRef` give a published activity an identity that survives
-- a rename, so re-publishing edits the activity instead of creating a second
-- one. `sourceVersion` is the version we last accepted, kept separate from
-- `updatedAt` on purpose: our own edits bump updatedAt, and comparing a push
-- against it would raise the bar and start rejecting the publisher's legitimate
-- pushes.
ALTER TABLE "EcaActivity" ADD COLUMN "source" TEXT;
ALTER TABLE "EcaActivity" ADD COLUMN "externalRef" TEXT;
ALTER TABLE "EcaActivity" ADD COLUMN "sourceVersion" TIMESTAMP(3);

CREATE UNIQUE INDEX "EcaActivity_schoolId_externalRef_key"
  ON "EcaActivity"("schoolId", "externalRef");

-- A club that meets Monday and Wednesday is one club. EcaActivity holds a
-- single dayOfWeek, so the second session had nowhere to go and a twice-weekly
-- club rendered as a once-weekly one.
CREATE TABLE "EcaActivityMeeting" (
    "id" TEXT NOT NULL,
    "ecaActivityId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "EcaActivityMeeting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EcaActivityMeeting_ecaActivityId_idx" ON "EcaActivityMeeting"("ecaActivityId");

ALTER TABLE "EcaActivityMeeting" ADD CONSTRAINT "EcaActivityMeeting_ecaActivityId_fkey"
  FOREIGN KEY ("ecaActivityId") REFERENCES "EcaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
