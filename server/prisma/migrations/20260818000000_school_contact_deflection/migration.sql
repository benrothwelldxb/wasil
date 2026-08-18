-- Optional "deflection" guard-rail on school contacts: a toggleable, editable
-- notice shown to parents before they start a thread to a high-traffic contact.
ALTER TABLE "SchoolContact" ADD COLUMN "warnBeforeMessaging" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SchoolContact" ADD COLUMN "warningMessage" TEXT;
