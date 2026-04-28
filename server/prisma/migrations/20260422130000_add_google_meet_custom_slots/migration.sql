-- AlterTable
ALTER TABLE "School" ADD COLUMN "googleCalendarRefreshToken" TEXT,
ADD COLUMN "googleCalendarEmail" TEXT;

-- AlterTable
ALTER TABLE "ConsultationTeacher" ADD COLUMN "locationType" TEXT NOT NULL DEFAULT 'IN_PERSON';

-- AlterTable
ALTER TABLE "ConsultationSlot" ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ConsultationBooking" ADD COLUMN "meetingLink" TEXT;
