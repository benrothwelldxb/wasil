import React, { useState, useEffect } from 'react'
import { ArrowLeft, Bell, MessageSquare, Mail, AlertTriangle, ClipboardList, Calendar, Newspaper, Activity, Sparkles, CalendarCheck, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import * as api from '@wasil/shared'
import type { NotificationPreferences } from '@wasil/shared'

interface PreferenceItem {
  key: keyof NotificationPreferences
  label: string
  description: string
  icon: React.ElementType
  color: string
  alwaysOn?: boolean
}

const SECTIONS: Array<{
  title: string
  items: PreferenceItem[]
}> = [
  {
    title: 'Communication',
    items: [
      { key: 'posts', label: 'Posts & Announcements', description: 'School-wide and class messages', icon: MessageSquare, color: '#C4506E' },
      { key: 'directMessages', label: 'Direct Messages', description: 'Messages from teachers and staff', icon: Mail, color: '#5B8EC4' },
      { key: 'emergencyAlerts', label: 'Emergency Alerts', description: 'Critical safety notifications', icon: AlertTriangle, color: '#D14D4D', alwaysOn: true },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { key: 'forms', label: 'Forms & Permissions', description: 'Consent forms, surveys, and requests', icon: ClipboardList, color: '#8B6EAE' },
      { key: 'events', label: 'Events', description: 'School events and calendar updates', icon: Calendar, color: '#5BA97B' },
      { key: 'weeklyUpdates', label: "Principal's Updates", description: 'Weekly messages from leadership', icon: Newspaper, color: '#E8A54B' },
      { key: 'pulseSurveys', label: 'Parent Pulse', description: 'Half-termly feedback surveys', icon: Activity, color: '#C47A5B' },
    ],
  },
  {
    title: 'Programmes',
    items: [
      { key: 'ecaUpdates', label: 'Activities (ECA)', description: 'Registration, allocations, and invitations', icon: Sparkles, color: '#5B6EC4' },
      { key: 'consultations', label: 'Consultations', description: "Parents' evening booking updates", icon: CalendarCheck, color: '#2D8B4E' },
      { key: 'schoolServices', label: 'School Services', description: 'Wraparound care and services', icon: Clock, color: '#7A6469' },
    ],
  },
]

export function NotificationSettingsPage() {
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    api.notifications.getPreferences().then(setPrefs).catch(console.error)
  }, [])

  const handleToggle = async (key: keyof NotificationPreferences) => {
    if (!prefs) return
    const newValue = !prefs[key]
    // Optimistic update
    setPrefs(prev => prev ? { ...prev, [key]: newValue } : prev)
    setSaving(key)
    try {
      await api.notifications.updatePreferences({ [key]: newValue })
    } catch {
      // Revert on error
      setPrefs(prev => prev ? { ...prev, [key]: !newValue } : prev)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F5EEF0' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#2D2225' }}>Notifications</h1>
          <p className="text-sm" style={{ color: '#7A6469' }}>Choose which notifications you receive</p>
        </div>
      </div>

      {!prefs ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-[22px] p-5 space-y-3" style={{ border: '1px solid #F0E4E6' }}>
              <div className="skeleton-pulse h-4 w-1/3 rounded" />
              <div className="skeleton-pulse h-12 w-full rounded-xl" />
              <div className="skeleton-pulse h-12 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        SECTIONS.map(section => (
          <div key={section.title}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 px-1" style={{ color: '#A8929A' }}>
              {section.title}
            </p>
            <div
              className="bg-white rounded-[22px] overflow-hidden"
              style={{ border: '1px solid #F0E4E6' }}
            >
              {section.items.map((item, idx) => {
                const Icon = item.icon
                const isOn = prefs[item.key]
                const isLast = idx === section.items.length - 1

                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-3 px-4 py-3.5"
                    style={{ borderBottom: isLast ? undefined : '1px solid #F5EEF0' }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: item.color + '15' }}
                    >
                      <Icon className="w-[18px] h-[18px]" style={{ color: item.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#2D2225' }}>
                        {item.label}
                      </p>
                      <p className="text-xs" style={{ color: '#A8929A' }}>
                        {item.description}
                      </p>
                    </div>
                    {item.alwaysOn ? (
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#EDFAF2', color: '#5BA97B' }}>
                        Always on
                      </span>
                    ) : (
                      <button
                        onClick={() => handleToggle(item.key)}
                        className="shrink-0 relative"
                        style={{ width: '48px', height: '28px' }}
                        disabled={saving === item.key}
                      >
                        <div
                          className="absolute inset-0 rounded-full transition-colors duration-200"
                          style={{ backgroundColor: isOn ? '#C4506E' : '#D8CDD0' }}
                        />
                        <div
                          className="absolute top-[2px] w-[24px] h-[24px] bg-white rounded-full shadow-sm transition-transform duration-200"
                          style={{ transform: isOn ? 'translateX(22px)' : 'translateX(2px)' }}
                        />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {/* Footer note */}
      <p className="text-xs text-center px-4" style={{ color: '#A8929A' }}>
        Emergency alerts cannot be disabled for your safety. All other notifications can be customised to your preference.
      </p>
    </div>
  )
}
