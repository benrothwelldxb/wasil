-- External providers (ECA / catering) with their own portal identity.

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('ECA', 'CATERING');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "logoUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSchoolLink" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "shareParentContact" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderSchoolLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUser" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorRecoveryCodes" TEXT,
    "twoFactorSetupAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderInvitation" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSchoolLink_providerId_schoolId_key" ON "ProviderSchoolLink"("providerId", "schoolId");
CREATE INDEX "ProviderSchoolLink_schoolId_idx" ON "ProviderSchoolLink"("schoolId");
CREATE UNIQUE INDEX "ProviderUser_email_key" ON "ProviderUser"("email");
CREATE INDEX "ProviderUser_providerId_idx" ON "ProviderUser"("providerId");
CREATE UNIQUE INDEX "ProviderRefreshToken_token_key" ON "ProviderRefreshToken"("token");
CREATE UNIQUE INDEX "ProviderInvitation_token_key" ON "ProviderInvitation"("token");
CREATE INDEX "ProviderInvitation_providerId_status_idx" ON "ProviderInvitation"("providerId", "status");

-- AddForeignKey
ALTER TABLE "ProviderSchoolLink" ADD CONSTRAINT "ProviderSchoolLink_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderSchoolLink" ADD CONSTRAINT "ProviderSchoolLink_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderUser" ADD CONSTRAINT "ProviderUser_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderRefreshToken" ADD CONSTRAINT "ProviderRefreshToken_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "ProviderUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderInvitation" ADD CONSTRAINT "ProviderInvitation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
