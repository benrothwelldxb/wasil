-- "What's new" for parents: which entries each parent has been shown. The
-- entries live in code; this only records who has seen which.
CREATE TABLE "ParentReleaseSeen" (
    "userId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentReleaseSeen_pkey" PRIMARY KEY ("userId","releaseId")
);

ALTER TABLE "ParentReleaseSeen" ADD CONSTRAINT "ParentReleaseSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
