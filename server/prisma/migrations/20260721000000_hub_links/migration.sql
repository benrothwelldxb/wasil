-- AlterTable
ALTER TABLE "School" ADD COLUMN "hubSchoolId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "hubUserId" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "hubPupilId" TEXT;

-- AlterTable
ALTER TABLE "YearGroup" ADD COLUMN "hubYearGroupId" TEXT;

-- AlterTable
ALTER TABLE "Class" ADD COLUMN "hubClassId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "School_hubSchoolId_key" ON "School"("hubSchoolId");

-- CreateIndex
CREATE UNIQUE INDEX "User_hubUserId_key" ON "User"("hubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_hubPupilId_key" ON "Student"("hubPupilId");

-- CreateIndex
CREATE UNIQUE INDEX "YearGroup_hubYearGroupId_key" ON "YearGroup"("hubYearGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_hubClassId_key" ON "Class"("hubClassId");
