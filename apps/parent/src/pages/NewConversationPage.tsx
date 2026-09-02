import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { AvailableContactsResponse } from '@wasil/shared'
import { ArrowLeft, User, Phone, Info, ChevronDown } from 'lucide-react'

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

type SchoolContact = AvailableContactsResponse['schoolContacts'][number]

const DEFAULT_WARNING =
  'This inbox receives a high volume of messages. For the quickest response, your child’s class teacher or the school office can usually help. If it’s something only this contact can help with, please continue.'

export function NewConversationPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useApi<AvailableContactsResponse>(
    () => api.inbox.availableContacts(),
    []
  )

  const handleSelectTeacher = async (teacherId: string, studentId?: string) => {
    try {
      const result = await api.inbox.createConversation({
        staffId: teacherId,
        studentId,
      })
      navigate(`/inbox/${result.id}`, { replace: true })
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }

  const [pendingContact, setPendingContact] = useState<SchoolContact | null>(null)

  const startContactConversation = async (contact: SchoolContact) => {
    try {
      const result = await api.inbox.createConversation({
        staffId: contact.assignedUserId,
        schoolContactId: contact.id,
      })
      navigate(`/inbox/${result.id}`, { replace: true })
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }

  const handleSelectContact = (contact: SchoolContact) => {
    // Deflection guard-rail: if this contact is flagged, show the notice first.
    if (contact.warnBeforeMessaging) {
      setPendingContact(contact)
      return
    }
    startContactConversation(contact)
  }

  // Group teachers by child. The list covers both the class teacher(s) and the
  // specialists who take the class (PE, music, Arabic …) — the latter carry a
  // `roleLabel` of what they teach, and sort after the class teachers.
  const childTeachers = new Map<string, {
    studentId: string
    studentName: string
    className: string
    teachers: Array<{ id: string; name: string; avatarUrl: string | null; roleLabel?: string }>
  }>()

  if (data) {
    for (const child of data.children) {
      const teachers = data.teachers.filter(t =>
        t.classes.some(c => c.id === child.classId)
      )
      if (teachers.length > 0) {
        childTeachers.set(child.studentId, {
          studentId: child.studentId,
          studentName: child.studentName,
          className: child.className,
          teachers: [...teachers]
            .sort((a, b) => Number(!!a.roleLabel) - Number(!!b.roleLabel))
            .map(t => ({ id: t.id, name: t.name, avatarUrl: t.avatarUrl, roleLabel: t.roleLabel })),
        })
      }
    }
  }

  // The list is long — a class teacher, several specialists, and every school
  // contact. Rather than one flat scroll, the two contacts a parent almost
  // always wants are above the fold and the rest wait behind an expander they
  // have to open deliberately.
  const classTeacherGroups = Array.from(childTeachers.values())
    .map(g => ({ ...g, teachers: g.teachers.filter(t => !t.roleLabel) }))
    .filter(g => g.teachers.length > 0)
  const specialistGroups = Array.from(childTeachers.values())
    .map(g => ({ ...g, teachers: g.teachers.filter(t => !!t.roleLabel) }))
    .filter(g => g.teachers.length > 0)
  const specialistCount = specialistGroups.reduce((n, g) => n + g.teachers.length, 0)

  // Which contacts sit above the fold is the school's call, not a guess from
  // the name here — "Reception" at one school is "Front Office" at the next.
  const pinnedContacts = (data?.schoolContacts ?? []).filter(c => c.alwaysVisible)
  const otherContacts = (data?.schoolContacts ?? []).filter(c => !c.alwaysVisible)

  // Flatten to (teacher, child) redirect candidates for the deflection notice.
  // CLASS teachers only — the notice points at "your child's class teacher", so
  // a specialist (PE, music …) is never the one we redirect to.
  const teacherCandidates = Array.from(childTeachers.values()).flatMap(group =>
    group.teachers.filter(t => !t.roleLabel).map(t => ({
      teacherId: t.id,
      teacherName: t.name,
      studentId: group.studentId,
      studentName: group.studentName,
    }))
  )

  const handleRedirectToTeacher = () => {
    setPendingContact(null)
    // One class teacher → jump straight into that thread. Otherwise dismiss the
    // notice and let the parent pick from the teacher list shown above.
    if (teacherCandidates.length === 1) {
      const c = teacherCandidates[0]
      handleSelectTeacher(c.teacherId, c.studentId)
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/inbox')}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F5EEF0' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: '#2D2225' }}>New Message</h1>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-[22px] p-5 space-y-3">
              <div className="skeleton-pulse h-4 w-1/3 rounded" />
              <div className="skeleton-pulse h-12 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Class teachers — the contact a parent wants most often, so it is
              the first thing on the screen and never behind an expander. */}
          {classTeacherGroups.map(group => (
            <div key={group.studentId} className="space-y-2">
              <h2 className="text-sm font-semibold px-1" style={{ color: '#7A6469' }}>
                {group.studentName}'s Class Teacher — {group.className}
              </h2>
              <div className="bg-white rounded-[22px] overflow-hidden" style={{ border: '1px solid #F0E4E6' }}>
                {group.teachers.map((teacher, idx) => (
                  <TeacherRow
                    key={teacher.id}
                    teacher={teacher}
                    isLast={idx === group.teachers.length - 1}
                    onSelect={() => handleSelectTeacher(teacher.id, group.studentId)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* The front desk, alongside the class teacher rather than below a
              list of everyone else. */}
          {pinnedContacts.length > 0 && (
            <div className="bg-white rounded-[22px] overflow-hidden" style={{ border: '1px solid #F0E4E6' }}>
              {pinnedContacts.map((contact, idx) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  isLast={idx === pinnedContacts.length - 1}
                  onSelect={() => handleSelectContact(contact)}
                />
              ))}
            </div>
          )}

          {/* Everyone else, closed. Opening one is a deliberate act, which is
              the point — these are people a parent occasionally needs, not
              people they should have to scroll past every time. */}
          {specialistCount > 0 && (
            <Accordion
              label="Specialist teachers"
              count={specialistCount}
              hint="PE, music, Arabic and other subject teachers"
            >
              {specialistGroups.map(group => (
                <div key={group.studentId}>
                  <p className="text-xs font-semibold px-4 pt-3 pb-1" style={{ color: '#A8929A' }}>
                    {group.studentName} — {group.className}
                  </p>
                  {group.teachers.map((teacher, idx) => (
                    <TeacherRow
                      key={teacher.id}
                      teacher={teacher}
                      isLast={idx === group.teachers.length - 1}
                      onSelect={() => handleSelectTeacher(teacher.id, group.studentId)}
                    />
                  ))}
                </div>
              ))}
            </Accordion>
          )}

          {otherContacts.length > 0 && (
            <Accordion
              label="Other staff"
              count={otherContacts.length}
              hint="Departments and school offices"
            >
              {otherContacts.map((contact, idx) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  isLast={idx === otherContacts.length - 1}
                  onSelect={() => handleSelectContact(contact)}
                />
              ))}
            </Accordion>
          )}

          {/* Empty state */}
          {childTeachers.size === 0 && (!data || data.schoolContacts.length === 0) && (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: '#7A6469' }}>
                No contacts available. Your school may not have assigned class teachers yet.
              </p>
            </div>
          )}
        </>
      )}

      {/* Deflection notice before messaging a high-traffic contact */}
      {pendingContact && (
        // Centred, never a bottom sheet: anchored to the bottom, the LAST button
        // ("Continue to …") fell under the tab bar and the home indicator, so the
        // one choice the notice exists to offer was the one you couldn't reach.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ backgroundColor: 'rgba(45, 34, 37, 0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={() => setPendingContact(null)}
        >
          <div
            className="bg-white rounded-[24px] w-full max-w-sm p-6 space-y-4 overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 6rem)' }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#FFF6E6' }}
              >
                <Info className="w-5 h-5" style={{ color: '#C7861A' }} />
              </div>
              <h2 className="text-base font-bold" style={{ color: '#2D2225' }}>
                Before you message {pendingContact.name}
              </h2>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: '#5A4A4F' }}>
              {pendingContact.warningMessage?.trim() || DEFAULT_WARNING}
            </p>

            <div className="space-y-2 pt-1">
              {teacherCandidates.length > 0 && (
                <button
                  onClick={handleRedirectToTeacher}
                  className="w-full py-3 rounded-2xl text-sm font-semibold text-white active:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#C4506E' }}
                >
                  {teacherCandidates.length === 1
                    ? `Message ${teacherCandidates[0].teacherName} instead`
                    : 'Message a class teacher instead'}
                </button>
              )}
              <button
                onClick={() => {
                  const c = pendingContact
                  setPendingContact(null)
                  startContactConversation(c)
                }}
                className="w-full py-3 rounded-2xl text-sm font-medium active:bg-gray-50 transition-colors"
                style={{ color: '#7A6469', border: '1px solid #F0E4E6' }}
              >
                Continue to {pendingContact.name}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A closed-by-default group.
 *
 * Shut on arrival on purpose: the contacts inside are ones a parent needs
 * occasionally, and leaving them open is what made this screen a long scroll.
 * The count is on the outside so nobody has to open it to find out whether
 * there is anything worth opening it for.
 */
function Accordion({
  label,
  count,
  hint,
  children,
}: {
  label: string
  count: number
  hint?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-[22px] overflow-hidden" style={{ border: '1px solid #F0E4E6' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
      >
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: '#2D2225' }}>
            {label} <span style={{ color: '#A8929A', fontWeight: 500 }}>({count})</span>
          </p>
          {hint && <p className="text-xs" style={{ color: '#A8929A' }}>{hint}</p>}
        </div>
        <ChevronDown
          className="w-4 h-4 shrink-0 transition-transform"
          style={{ color: '#C4506E', transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open && <div style={{ borderTop: '1px solid #F5EEF0' }}>{children}</div>}
    </div>
  )
}

function TeacherRow({
  teacher,
  isLast,
  onSelect,
}: {
  teacher: { id: string; name: string; avatarUrl: string | null; roleLabel?: string }
  isLast: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-4 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
      style={{ borderBottom: isLast ? undefined : '1px solid #F5EEF0' }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
        style={{ backgroundColor: '#F5EEF0', color: '#C4506E' }}
      >
        {teacher.avatarUrl
          ? <img src={teacher.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
          : getInitials(teacher.name)}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: '#2D2225' }}>{teacher.name}</p>
        <p className="text-xs" style={{ color: '#A8929A' }}>{teacher.roleLabel || 'Class Teacher'}</p>
      </div>
      <User className="w-4 h-4 shrink-0" style={{ color: '#D0C5C8' }} />
    </button>
  )
}

function ContactRow({
  contact,
  isLast,
  onSelect,
}: {
  contact: SchoolContact
  isLast: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-4 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
      style={{ borderBottom: isLast ? undefined : '1px solid #F5EEF0' }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg"
        style={{ backgroundColor: '#FFF0F3' }}
      >
        {contact.icon || <Phone className="w-5 h-5" style={{ color: '#C4506E' }} />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: '#2D2225' }}>{contact.name}</p>
        {contact.description && (
          <p className="text-xs" style={{ color: '#A8929A' }}>{contact.description}</p>
        )}
      </div>
      <User className="w-4 h-4 shrink-0" style={{ color: '#D0C5C8' }} />
    </button>
  )
}
