ALTER TABLE "ConversationMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ConversationMessage" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "ConversationMessage" ADD COLUMN "replyToId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "mutedByParent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN "mutedByStaff" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ConversationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "MessageReaction"("messageId", "userId", "emoji");
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
