-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceRequestType" AS ENUM ('ABSENCE', 'EARLY_PICKUP', 'LATE_ARRIVAL');

-- CreateEnum
CREATE TYPE "RequestApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
ALTER TYPE "AuditResourceType" ADD VALUE 'ATTENDANCE';
ALTER TYPE "AuditResourceType" ADD VALUE 'ATTENDANCE_REQUEST';

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "markedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "AttendanceRequestType" NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "time" TEXT,
    "status" "RequestApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_studentId_date_key" ON "AttendanceRecord"("studentId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_schoolId_date_idx" ON "AttendanceRecord"("schoolId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_idx" ON "AttendanceRecord"("studentId");

-- CreateIndex
CREATE INDEX "AttendanceRequest_schoolId_status_idx" ON "AttendanceRequest"("schoolId", "status");

-- CreateIndex
CREATE INDEX "AttendanceRequest_studentId_idx" ON "AttendanceRequest"("studentId");

-- CreateIndex
CREATE INDEX "AttendanceRequest_parentId_idx" ON "AttendanceRequest"("parentId");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
