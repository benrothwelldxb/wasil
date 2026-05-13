-- CreateTable
CREATE TABLE "CafeteriaCategory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeteriaCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafeteriaCafeItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "dietaryTags" TEXT,
    "allergens" TEXT,
    "calories" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeteriaCafeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CafeteriaCategory_schoolId_isActive_idx" ON "CafeteriaCategory"("schoolId", "isActive");

-- CreateIndex
CREATE INDEX "CafeteriaCafeItem_categoryId_idx" ON "CafeteriaCafeItem"("categoryId");

-- AddForeignKey
ALTER TABLE "CafeteriaCategory" ADD CONSTRAINT "CafeteriaCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeteriaCafeItem" ADD CONSTRAINT "CafeteriaCafeItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CafeteriaCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
