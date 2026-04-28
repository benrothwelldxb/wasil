-- AlterTable: Add scheduling to Messages
ALTER TABLE "Message" ADD COLUMN "scheduledAt" TIMESTAMP(3);

-- AlterTable: Add scheduling and media to WeeklyMessage
ALTER TABLE "WeeklyMessage" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "WeeklyMessage" ADD COLUMN "scheduledAt" TIMESTAMP(3);
