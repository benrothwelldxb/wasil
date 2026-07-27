-- Partner API tokens for external Wasil apps (e.g. Desk) calling Connect's
-- narrow /api/partner surface. Only the SHA-256 hash of the plaintext is stored.
CREATE TABLE "PartnerToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerToken_tokenHash_key" ON "PartnerToken"("tokenHash");
