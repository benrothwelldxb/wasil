-- A parent suggestion box, off by default.

-- Off by default, like transport: a suggestion box is a commitment to read and
-- answer things, and a school should turn it on once it has decided who does
-- that, rather than find it already running.
ALTER TABLE "School" ADD COLUMN "suggestionsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- `authorId` NULL means anonymous, and nothing else on this row is derived from
-- the author — no hash, no IP, no device id. `createdAt` is rounded to the hour
-- when anonymous, because a to-the-second timestamp is itself an identifier
-- once you hold the rest of the app's logs.
--
-- ON DELETE SET NULL, not CASCADE: removing a parent account anonymises their
-- suggestions rather than destroying them. A school acting on an idea should
-- not have it vanish because somebody left.
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "authorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Suggestion_schoolId_status_createdAt_idx" ON "Suggestion"("schoolId", "status", "createdAt");

ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_handledById_fkey"
    FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- How many suggestions a parent has made today. Deliberately NOT related to
-- Suggestion: no foreign key, no shared id, nothing to join on.
--
-- Rate limiting and anonymity pull against each other — you cannot cap what you
-- cannot count, and you cannot count what you cannot attribute. This is the
-- smallest thing that resolves it: a count per parent per day, holding no
-- reference to any suggestion and no time more precise than the date.
CREATE TABLE "SuggestionQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dayLocal" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SuggestionQuota_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuggestionQuota_userId_dayLocal_key" ON "SuggestionQuota"("userId", "dayLocal");

ALTER TABLE "SuggestionQuota" ADD CONSTRAINT "SuggestionQuota_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
