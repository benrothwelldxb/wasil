-- Track when each parent last confirmed their phone number
ALTER TABLE "User" ADD COLUMN "phoneConfirmedAt" TIMESTAMP(3);

-- Per-school re-prompt interval. 0 disables the modal.
ALTER TABLE "School" ADD COLUMN "contactConfirmDays" INTEGER NOT NULL DEFAULT 180;
