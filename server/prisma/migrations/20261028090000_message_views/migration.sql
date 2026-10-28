-- A parent had a post on their screen. Recorded from the parent app when at
-- least half the card has been visible for a second; the earliest sighting is
-- kept. Empty on deploy, which is correct: nothing before today was recorded,
-- and the admin view says so rather than reporting old posts as unseen.
CREATE TABLE "MessageView" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageView_pkey" PRIMARY KEY ("messageId","userId")
);

CREATE INDEX "MessageView_userId_idx" ON "MessageView"("userId");

ALTER TABLE "MessageView" ADD CONSTRAINT "MessageView_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageView" ADD CONSTRAINT "MessageView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
