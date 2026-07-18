-- Add SMS and WhatsApp as reliable-delivery outbox kinds so emergency-alert
-- text channels get the same retry/backoff as email and push instead of a
-- single inline best-effort send.
ALTER TYPE "OutboxKind" ADD VALUE IF NOT EXISTS 'SMS';
ALTER TYPE "OutboxKind" ADD VALUE IF NOT EXISTS 'WHATSAPP';
