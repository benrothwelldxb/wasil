-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorSecret" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorRecoveryCodes" TEXT,
ADD COLUMN     "twoFactorSetupAt" TIMESTAMP(3),
ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);
