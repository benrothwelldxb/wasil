import { describe, it, expect } from 'vitest'
import { serializeBookingForParent } from '../src/services/consultationSerializers'

const raw = {
  id: 'booking-1',
  parentId: 'parent-A',
  studentId: 'student-1',
  studentName: 'Child A',
  notes: 'confidential notes about the child',
  meetingLink: 'https://meet.google.com/private-xyz',
  createdAt: new Date('2026-01-01T09:00:00.000Z'),
}

// Guards H1: a parent must see that a slot is taken, but never another family's
// child name, notes, or Google Meet link.
describe('serializeBookingForParent (H1 consultation-leak guardrail)', () => {
  it('returns null when there is no booking', () => {
    expect(serializeBookingForParent(null, 'parent-A')).toBeNull()
    expect(serializeBookingForParent(undefined, 'parent-A')).toBeNull()
  })

  it('exposes full details to the parent who made the booking', () => {
    const out = serializeBookingForParent(raw, 'parent-A')!
    expect(out.isOwn).toBe(true)
    expect(out.parentId).toBe('parent-A')
    expect(out.studentName).toBe('Child A')
    expect(out.notes).toBe('confidential notes about the child')
    expect(out.meetingLink).toBe('https://meet.google.com/private-xyz')
  })

  it('redacts every private field from other families but keeps the slot marked taken', () => {
    const out = serializeBookingForParent(raw, 'parent-B')!
    expect(out.isOwn).toBe(false)
    expect(out.id).toBe('booking-1') // UI can still render the slot as unavailable
    expect(out.parentId).toBeNull()  // client ownership check reads this as "not mine"
    expect(out.studentId).toBeNull()
    expect(out.studentName).toBeNull()
    expect(out.notes).toBeNull()
    expect(out.meetingLink).toBeNull()
  })
})
