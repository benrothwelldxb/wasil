-- Desk marks School Services registrations as paid, and the accounts team doing
-- it has no Connect session — so the audit trail needs a resource type of its
-- own rather than borrowing an unrelated one.
--
-- Adding an enum value is additive and non-blocking: no existing row changes,
-- and nothing reads this value until the partner route ships. Postgres 12+
-- permits ADD VALUE inside a transaction provided the new value is not used in
-- the same transaction, which it is not.
ALTER TYPE "AuditResourceType" ADD VALUE 'SCHOOL_SERVICE';
