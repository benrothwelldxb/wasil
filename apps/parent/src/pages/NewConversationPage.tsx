import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { AvailableContactsResponse } from '@wasil/shared'
import { ArrowLeft, User, Phone } from 'lucide-react'

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

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

  const handleSelectContact = async (contact: { assignedUserId: string; id: string }) => {
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

  // Group teachers by child
  const childTeachers = new Map<string, {
    studentId: string
    studentName: string
    className: string
    teachers: Array<{ id: string; name: string; avatarUrl: string | null }>
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
          teachers: teachers.map(t => ({ id: t.id, name: t.name, avatarUrl: t.avatarUrl })),
        })
      }
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
          {/* Teachers by child */}
          {Array.from(childTeachers.values()).map(group => (
            <div key={group.studentId} className="space-y-2">
              <h2 className="text-sm font-semibold px-1" style={{ color: '#7A6469' }}>
                {group.studentName}'s Teachers — {group.className}
              </h2>
              <div className="bg-white rounded-[22px] overflow-hidden" style={{ border: '1px solid #F0E4E6' }}>
                {group.teachers.map((teacher, idx) => (
                  <button
                    key={teacher.id}
                    onClick={() => handleSelectTeacher(teacher.id, group.studentId)}
                    className="w-full text-left px-4 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
                    style={{
                      borderBottom: idx < group.teachers.length - 1 ? '1px solid #F5EEF0' : undefined,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{ backgroundColor: '#F5EEF0', color: '#C4506E' }}
                    >
                      {teacher.avatarUrl ? (
                        <img src={teacher.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        getInitials(teacher.name)
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: '#2D2225' }}>
                        {teacher.name}
                      </p>
                      <p className="text-xs" style={{ color: '#A8929A' }}>Class Teacher</p>
                    </div>
                    <User className="w-4 h-4 shrink-0" style={{ color: '#D0C5C8' }} />
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* School contacts */}
          {data && data.schoolContacts.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold px-1" style={{ color: '#7A6469' }}>
                School Contacts
              </h2>
              <div className="bg-white rounded-[22px] overflow-hidden" style={{ border: '1px solid #F0E4E6' }}>
                {data.schoolContacts.map((contact, idx) => (
                  <button
                    key={contact.id}
                    onClick={() => handleSelectContact(contact)}
                    className="w-full text-left px-4 py-3.5 flex items-center gap-3 active:bg-gray-50 transition-colors"
                    style={{
                      borderBottom: idx < data.schoolContacts.length - 1 ? '1px solid #F5EEF0' : undefined,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg"
                      style={{ backgroundColor: '#FFF0F3' }}
                    >
                      {contact.icon || <Phone className="w-5 h-5" style={{ color: '#C4506E' }} />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: '#2D2225' }}>
                        {contact.name}
                      </p>
                      {contact.description && (
                        <p className="text-xs" style={{ color: '#A8929A' }}>{contact.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
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
    </div>
  )
}
