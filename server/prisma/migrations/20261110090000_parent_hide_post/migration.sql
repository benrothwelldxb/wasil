-- A parent can hide a post from their own feed. Nobody else's feed changes;
-- the post stays on the Posts page, marked hidden, and can be put back.
CREATE TABLE "MessageHide" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageHide_pkey" PRIMARY KEY ("messageId","userId")
);

CREATE INDEX "MessageHide_userId_idx" ON "MessageHide"("userId");

ALTER TABLE "MessageHide" ADD CONSTRAINT "MessageHide_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageHide" ADD CONSTRAINT "MessageHide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
