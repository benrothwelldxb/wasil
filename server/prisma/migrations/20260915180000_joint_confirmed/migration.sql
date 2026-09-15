-- Did a named person confirm this family is happy with joint correspondence?
--
-- Staff may now add a second guardian to a thread, reversing a design where
-- that was the parent's own opt-in. The safeguard moved from the system to a
-- person ticking a box in Desk — this is what stops that being a property of
-- Desk's current UI alone.
--
-- NULL = not applicable: a parent sharing their own thread, which is every row
-- that existed before staff sharing did. TRUE = a staff member confirmed it.
ALTER TABLE "ConversationParticipant" ADD COLUMN "jointConfirmed" BOOLEAN;
