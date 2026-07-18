-- Let an external catering provider own a weekly menu (null = school-run).
ALTER TABLE "CafeteriaMenu" ADD COLUMN "providerId" TEXT;

CREATE INDEX "CafeteriaMenu_providerId_idx" ON "CafeteriaMenu"("providerId");

ALTER TABLE "CafeteriaMenu" ADD CONSTRAINT "CafeteriaMenu_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
