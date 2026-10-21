-- Posts addressed to the families of particular pupils.
--
-- A Message row targets one class, year group, group or the whole school, and
-- none of those can say "these four families": a waiting-list offer goes to one
-- family, a consent chaser to those who have not answered. Such a row carries
-- no other target, and these links are the whole of its audience, both for who
-- is notified and for whose feed it appears in.
CREATE TABLE "MessageStudentTarget" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "MessageStudentTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageStudentTarget_messageId_studentId_key" ON "MessageStudentTarget"("messageId", "studentId");
CREATE INDEX "MessageStudentTarget_studentId_idx" ON "MessageStudentTarget"("studentId");

-- Cascade on both sides: a deleted post has no audience, and a pupil removed
-- from the school must not keep a post addressed to their family.
ALTER TABLE "MessageStudentTarget" ADD CONSTRAINT "MessageStudentTarget_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageStudentTarget" ADD CONSTRAINT "MessageStudentTarget_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
