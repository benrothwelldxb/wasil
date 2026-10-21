// Who may change a group a partner app keeps in step.
//
// A group published under an externalRef is stamped `managedBy` with the
// publishing token's name. From then on only that app changes it: membership,
// name, archive. Everyone else, including a Connect admin and Desk, gets the
// same refusal and can still broadcast to it.
//
// WHY A LOCK AND NOT A WARNING. Beyond narrows a trip group to the families of
// pupils going once consent closes, and keeps it in step as bookings and the
// waiting list move. A hand edit is not merely overwritten on the next sync: a
// family added by hand gets the trip's messages until then, and a group deleted
// by hand in Connect is a HARD delete that clears groupId on every post sent to
// it, so the trip's message history loses its link for good.

/** The owner name a partner token publishes under. Lowercased and trimmed, so
 *  "Beyond" and "beyond " minted on different nights are the same owner. */
export function ownerNameOf(partner: { name: string } | undefined | null): string | null {
  const n = partner?.name?.trim().toLowerCase()
  return n ? n : null
}

/** True when a group is owned by an app other than the caller. A caller with
 *  no partner identity (a Connect admin) is "elsewhere" for every managed
 *  group. An unmanaged group is nobody's, so never elsewhere. */
export function isManagedElsewhere(managedBy: string | null | undefined, callerOwner: string | null): boolean {
  if (!managedBy) return false
  return managedBy !== callerOwner
}

const LABELS: Record<string, string> = {
  beyond: 'Wasil Beyond',
  active: 'Wasil Active',
  desk: 'Wasil Desk',
}

/** What a person reads: "Wasil Beyond" rather than a token name. */
export function managedByLabel(managedBy: string): string {
  return LABELS[managedBy] ?? managedBy
}

/** The refusal body, shared by the partner surface and the admin routes so
 *  every caller can switch on one code. */
export function managedElsewhereBody(managedBy: string) {
  const label = managedByLabel(managedBy)
  return {
    error: 'group_managed_elsewhere',
    managedBy,
    message: `This group is kept up to date by ${label}. Change it in ${label}, not here.`,
  }
}

/** The same refusal for Connect's own admin screens, whose client shows the
 *  `error` field to the reader as it stands. So there `error` is the sentence
 *  and the code moves to `code`. */
export function managedElsewhereAdminBody(managedBy: string) {
  const body = managedElsewhereBody(managedBy)
  return { error: body.message, code: body.error, managedBy }
}
