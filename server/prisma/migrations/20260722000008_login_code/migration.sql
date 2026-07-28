-- Passwordless parent sign-in codes. Only the SHA-256 hash of the 6-digit code
-- is stored; the plaintext is emailed once and never persisted. `attempts`
-- locks a code after 5 wrong guesses, `consumedAt` enforces single-use, and the
-- (email, createdAt) index serves the "newest valid code for this email" lookup.
CREATE TABLE "LoginCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginCode_email_createdAt_idx" ON "LoginCode"("email", "createdAt");
