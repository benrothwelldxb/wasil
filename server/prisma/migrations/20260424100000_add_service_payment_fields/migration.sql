ALTER TABLE "SchoolService" ADD COLUMN "costIsFrom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SchoolService" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'AED';
ALTER TABLE "SchoolService" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "SchoolService" ADD COLUMN "paymentUrl" TEXT;
