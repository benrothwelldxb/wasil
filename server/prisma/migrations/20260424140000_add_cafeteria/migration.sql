ALTER TABLE "School" ADD COLUMN "cafeteriaUrl" TEXT;

CREATE TABLE "CafeteriaMenu" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "imageUrl" TEXT,
    "orderUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CafeteriaMenu_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CafeteriaMenuItem" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "mealType" TEXT NOT NULL DEFAULT 'LUNCH',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dietaryTags" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CafeteriaMenuItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CafeteriaMenu_schoolId_weekOf_key" ON "CafeteriaMenu"("schoolId", "weekOf");
CREATE INDEX "CafeteriaMenu_schoolId_isPublished_idx" ON "CafeteriaMenu"("schoolId", "isPublished");
CREATE INDEX "CafeteriaMenuItem_menuId_dayOfWeek_idx" ON "CafeteriaMenuItem"("menuId", "dayOfWeek");

ALTER TABLE "CafeteriaMenu" ADD CONSTRAINT "CafeteriaMenu_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CafeteriaMenuItem" ADD CONSTRAINT "CafeteriaMenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "CafeteriaMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
