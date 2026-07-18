-- Parent bookings of paid, provider-run clubs (direct enrolment).
CREATE TABLE "EcaProviderBooking" (
    "id" TEXT NOT NULL,
    "ecaActivityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaProviderBooking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EcaProviderBooking_ecaActivityId_studentId_key" ON "EcaProviderBooking"("ecaActivityId", "studentId");
CREATE INDEX "EcaProviderBooking_ecaActivityId_idx" ON "EcaProviderBooking"("ecaActivityId");
CREATE INDEX "EcaProviderBooking_parentUserId_idx" ON "EcaProviderBooking"("parentUserId");
CREATE INDEX "EcaProviderBooking_schoolId_idx" ON "EcaProviderBooking"("schoolId");

ALTER TABLE "EcaProviderBooking" ADD CONSTRAINT "EcaProviderBooking_ecaActivityId_fkey" FOREIGN KEY ("ecaActivityId") REFERENCES "EcaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcaProviderBooking" ADD CONSTRAINT "EcaProviderBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcaProviderBooking" ADD CONSTRAINT "EcaProviderBooking_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcaProviderBooking" ADD CONSTRAINT "EcaProviderBooking_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
