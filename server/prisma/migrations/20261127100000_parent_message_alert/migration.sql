-- A parent's message alerts staff once the parent stops typing, not per
-- message: "Hi" ⏎ then the real message used to buzz the teacher twice, the
-- first time with nothing but "Hi". The alert is an outbox row due a minute
-- after the message; see services/messageAlert.ts.
ALTER TYPE "OutboxKind" ADD VALUE IF NOT EXISTS 'MESSAGE_ALERT';
