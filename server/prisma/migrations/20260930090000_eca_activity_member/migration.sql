-- Who is in a club, without making a group of them.
--
-- Rosters could previously reach Connect only as a Group, which is a messaging
-- audience: carrying enrolment that way means a new way to message a school for
-- every club that wants a register. The first school ticked it for 11 of 27
-- clubs and stopped, leaving the children in the other 16 invisible in the app.
--
-- This grants nothing. It says which children are in a club and nothing else.
-- The group path still works and still wins where a school wants the club to be
-- a messaging audience; the two are unioned at read time.
CREATE TABLE "EcaActivityMember" (
    "id" TEXT NOT NULL,
    "ecaActivityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EcaActivityMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EcaActivityMember_ecaActivityId_studentId_key" ON "EcaActivityMember"("ecaActivityId", "studentId");
CREATE INDEX "EcaActivityMember_studentId_idx" ON "EcaActivityMember"("studentId");

-- Cascade on both sides: a deleted club has no register, and a child removed
-- from the school must not linger on one.
ALTER TABLE "EcaActivityMember" ADD CONSTRAINT "EcaActivityMember_ecaActivityId_fkey" FOREIGN KEY ("ecaActivityId") REFERENCES "EcaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcaActivityMember" ADD CONSTRAINT "EcaActivityMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
