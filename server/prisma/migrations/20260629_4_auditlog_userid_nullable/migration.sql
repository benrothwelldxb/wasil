-- Drop the existing FK constraint so we can rewrite it as ON DELETE SET NULL
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_userId_fkey";

-- Allow NULL so deleted users leave anonymised audit rows behind
ALTER TABLE "AuditLog" ALTER COLUMN "userId" DROP NOT NULL;

-- Re-add the FK with SET NULL on user delete
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
