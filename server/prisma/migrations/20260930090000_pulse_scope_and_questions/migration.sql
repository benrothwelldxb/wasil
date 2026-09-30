-- Choosing what a pulse asks, and who it goes to.

-- Which of the seven core questions this survey asks.
--
-- The core set used to be mandatory, so every pulse was eight questions
-- whatever it was for: a "how has the start of the year felt" survey still
-- asked about homework feedback and behaviour expectations, and the length is
-- what stops people answering.
--
-- Backfilled to all seven for every EXISTING survey, so nothing already sent
-- changes shape and no answered survey loses a question it asked. That backfill
-- is also what lets an empty list mean "no core questions" rather than "an old
-- row" — which is a legitimate choice for a one-question check-in.
ALTER TABLE "PulseSurvey" ADD COLUMN "coreQuestionKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "PulseSurvey" SET "coreQuestionKeys" = ARRAY[
  'core_quality',
  'core_belonging',
  'core_communication',
  'core_responsiveness',
  'core_expectations',
  'core_overall_satisfaction',
  'core_improve_now'
];

-- Who it goes to. SCHOOL is the old behaviour and stays the default, so every
-- existing survey keeps exactly the audience it was sent to.
--
-- This matters beyond delivery: the response RATE is measured against the
-- audience. A survey sent to 30 new parents that scored its 12 replies against
-- 400 families would read as a 3% response to something nearly half of them
-- answered.
ALTER TABLE "PulseSurvey" ADD COLUMN "audienceType" TEXT NOT NULL DEFAULT 'SCHOOL';
ALTER TABLE "PulseSurvey" ADD COLUMN "audienceGroupId" TEXT;
ALTER TABLE "PulseSurvey" ADD COLUMN "audienceYearGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "PulseSurvey" ADD CONSTRAINT "PulseSurvey_audienceGroupId_fkey"
    FOREIGN KEY ("audienceGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
