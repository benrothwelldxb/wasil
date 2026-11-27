/**
 * Whether a message reached the primary parent's phone as a notification.
 *
 * Exists because a read receipt cannot see the lock screen. A notification
 * carries up to 200 characters of the message, so most short messages are read
 * in full there and the app is never opened — readAt stays null, and to staff
 * that looked the same as the message never arriving. The two are different
 * calls to make: "they probably saw it" versus "ring them".
 *
 * Only what Connect actually knows is claimed:
 *   'SENT'      Apple/Google accepted the push for at least one of the parent's
 *               devices. Not "delivered" — a phone can be off — and never "read".
 *   'NO_DEVICE' The parent has no phone registered for notifications, so nothing
 *               went out. They will see it only when they next open Connect.
 *   null        No claim. A muted thread is the parent's own business and is not
 *               reported to staff as such; a send where every device refused is
 *               ambiguous (a transient FCM failure looks the same), so it says
 *               nothing rather than guess.
 */
export type PushOutcome = 'SENT' | 'NO_DEVICE'

export function pushOutcomeFor(args: {
  muted: boolean
  tokenCount: number
  /** Devices FCM accepted. Undefined when no send was attempted. */
  successCount?: number
}): PushOutcome | null {
  if (args.muted) return null
  if (args.tokenCount === 0) return 'NO_DEVICE'
  return (args.successCount ?? 0) > 0 ? 'SENT' : null
}

/** A value read back from the column, narrowed — anything unexpected is no claim. */
export function readPushOutcome(v: string | null | undefined): PushOutcome | null {
  return v === 'SENT' || v === 'NO_DEVICE' ? v : null
}
