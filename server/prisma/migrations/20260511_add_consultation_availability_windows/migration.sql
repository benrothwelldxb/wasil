-- CreateTable
CREATE TABLE "ConsultationAvailabilityWindow" (
    "id" TEXT NOT NULL,
    "consultationTeacherId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationAvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultationAvailabilityWindow_consultationTeacherId_date_idx" ON "ConsultationAvailabilityWindow"("consultationTeacherId", "date");

-- AddForeignKey
ALTER TABLE "ConsultationAvailabilityWindow" ADD CONSTRAINT "ConsultationAvailabilityWindow_consultationTeacherId_fkey" FOREIGN KEY ("consultationTeacherId") REFERENCES "ConsultationTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
