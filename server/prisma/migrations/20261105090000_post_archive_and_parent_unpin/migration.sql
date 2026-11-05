-- An admin can archive posts in bulk from the Posts page: hidden from parents
-- everywhere, never deleted, restorable. Null on every existing row, which is
-- correct: nothing has been archived yet.
ALTER TABLE "Message" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "archivedById" TEXT;

-- A parent can unpin a post for themselves. The school's pin is untouched;
-- this parent just stops having it held at the top of their feed.
CREATE TABLE "MessagePinDismissal" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagePinDismissal_pkey" PRIMARY KEY ("messageId","userId")
);

CREATE INDEX "MessagePinDismissal_userId_idx" ON "MessagePinDismissal"("userId");

ALTER TABLE "MessagePinDismissal" ADD CONSTRAINT "MessagePinDismissal_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagePinDismissal" ADD CONSTRAINT "MessagePinDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
