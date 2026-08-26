-- An admin looking at staff↔parent threads that aren't their own is an AUDITED
-- act (partner inbox `?scope=school`), so it needs its own resource type rather
-- than borrowing MESSAGE, which means a broadcast.
ALTER TYPE "AuditResourceType" ADD VALUE IF NOT EXISTS 'CONVERSATION';
