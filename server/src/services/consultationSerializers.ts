/**
 * Serialize a consultation slot's booking for a PARENT-facing response.
 *
 * A parent must be able to see that a slot is taken (so the UI can disable it),
 * but must NOT see who booked it or any of its private details — child name,
 * free-text notes, or the Google Meet link. Those are exposed only to the
 * parent who made the booking. Without this redaction any parent could read
 * every family's consultation notes and join their private teacher meetings.
 */
export interface RawBooking {
  id: string
  parentId: string
  studentId?: string | null
  studentName?: string | null
  notes?: string | null
  meetingLink?: string | null
  createdAt: Date
}

export interface SerializedBooking {
  id: string
  parentId: string | null
  studentId: string | null
  studentName: string | null
  notes: string | null
  meetingLink: string | null
  createdAt: string
  isOwn: boolean
}

export function serializeBookingForParent(
  booking: RawBooking | null | undefined,
  requestingUserId: string,
): SerializedBooking | null {
  if (!booking) return null
  const isOwn = booking.parentId === requestingUserId
  return {
    id: booking.id,
    // parentId stays null for other families so the client's ownership check
    // (booking.parentId === user.id) correctly reads the slot as "taken".
    parentId: isOwn ? booking.parentId : null,
    studentId: isOwn ? (booking.studentId ?? null) : null,
    studentName: isOwn ? (booking.studentName ?? null) : null,
    notes: isOwn ? (booking.notes ?? null) : null,
    meetingLink: isOwn ? (booking.meetingLink ?? null) : null,
    createdAt: booking.createdAt.toISOString(),
    isOwn,
  }
}
