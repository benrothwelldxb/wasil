-- Acknowledgement becomes opt-in per post.
--
-- Every post used to show parents an Acknowledge button, which made the signal
-- worthless: if everything asks to be acknowledged, the notices that genuinely
-- need it don't stand out. Defaulting to false deliberately stops EXISTING posts
-- asking as well as new ones — most of them are read-and-consume.
--
-- Acknowledgements already recorded are untouched; MessageAcknowledgment rows
-- keep their history and a parent who has acknowledged still sees that they did.
ALTER TABLE "Message" ADD COLUMN "requiresAcknowledgment" BOOLEAN NOT NULL DEFAULT false;
