import React, { useEffect, useState } from 'react'
import { Save, Mail, Clock, Globe } from 'lucide-react'
import { useToast, api } from '@wasil/shared'
import type { SchoolSettings, SchoolModuleFlag } from '@wasil/shared'

interface ModuleGroup {
  label: string
  flags: { key: SchoolModuleFlag; label: string; description: string }[]
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: 'Communication',
    flags: [
      { key: 'inboxEnabled', label: 'Inbox', description: 'Two-way messaging between parents and staff' },
      { key: 'postsEnabled', label: 'Posts', description: 'Whole-school and class announcements' },
      { key: 'emergencyAlertsEnabled', label: 'Emergency Alerts', description: 'Urgent push alerts to all parents' },
    ],
  },
  {
    label: 'Engagement',
    flags: [
      { key: 'formsEnabled', label: 'Forms', description: 'Custom forms and surveys' },
      { key: 'eventsEnabled', label: 'Events', description: 'Calendar events with RSVPs' },
      { key: 'weeklyUpdatesEnabled', label: 'Weekly Updates', description: 'Principal weekly updates' },
      { key: 'pulseEnabled', label: 'Parent Pulse', description: 'Termly parent satisfaction surveys' },
      { key: 'attendanceEnabled', label: 'Attendance Register', description: 'Daily attendance marking + parent requests' },
    ],
  },
  {
    label: 'Programmes',
    flags: [
      { key: 'ecaEnabled', label: 'Activities (ECA)', description: 'After-school activities & registration' },
      { key: 'consultationsEnabled', label: 'Consultations', description: "Parents' evening bookings" },
      { key: 'schoolServicesEnabled', label: 'School Services', description: 'Bus, after-school clubs and similar' },
      { key: 'lunchMenuEnabled', label: 'Lunch Menu', description: 'Cafeteria menus' },
    ],
  },
  {
    label: 'Calendar',
    flags: [
      { key: 'termDatesEnabled', label: 'Term Dates', description: 'Academic year term dates' },
      { key: 'scheduleEnabled', label: 'Schedule', description: 'Class timetables and schedules' },
    ],
  },
  {
    label: 'Resources',
    flags: [
      { key: 'policiesEnabled', label: 'Policies', description: 'School policy documents' },
      { key: 'filesEnabled', label: 'Files', description: 'Shared files and folders' },
      { key: 'linksEnabled', label: 'External Links', description: 'Useful external links' },
      { key: 'knowledgeBaseEnabled', label: 'Knowledge Base', description: 'FAQ and reference articles' },
    ],
  },
]

const TIMEZONE_OPTIONS = [
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Qatar',
  'Asia/Kuwait',
  'Asia/Bahrain',
  'Asia/Muscat',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative inline-flex items-center transition-colors rounded-full shrink-0"
      style={{
        width: '40px',
        height: '22px',
        backgroundColor: checked ? '#C4506E' : '#E2E8F0',
      }}
      aria-pressed={checked}
    >
      <span
        className="inline-block bg-white rounded-full shadow-sm transition-transform"
        style={{
          width: '18px',
          height: '18px',
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
        }}
      />
    </button>
  )
}

export function SettingsPage() {
  const toast = useToast()
  const [settings, setSettings] = useState<SchoolSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    api.schoolSettings.get()
      .then(s => { setSettings(s); setLoading(false) })
      .catch(err => { toast.error(err.message || 'Failed to load settings'); setLoading(false) })
  }, [])

  const updateField = <K extends keyof SchoolSettings>(key: K, value: SchoolSettings[K]) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev)
    setDirty(true)
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const { id: _id, name: _name, ...update } = settings
      const updated = await api.schoolSettings.update(update)
      setSettings(updated)
      setDirty(false)
      toast.success('Settings saved')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400">
        <p className="text-sm">Loading settings...</p>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="p-6 text-center text-slate-400">
        <p className="text-sm">Could not load settings.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">School Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Turn modules on or off for {settings.name}, and configure the daily attendance digest.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-5 py-2.5 rounded-xl text-white text-sm font-bold flex items-center gap-2 shrink-0"
          style={{
            backgroundColor: dirty && !saving ? '#C4506E' : '#E2E8F0',
            color: dirty && !saving ? 'white' : '#94A3B8',
            cursor: dirty && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      {/* Locale */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Locale
        </h2>
        <label className="block text-xs font-semibold text-slate-500 mb-1">School timezone</label>
        <select
          value={settings.timezone}
          onChange={e => updateField('timezone', e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
        >
          {TIMEZONE_OPTIONS.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
          {!TIMEZONE_OPTIONS.includes(settings.timezone) && (
            <option value={settings.timezone}>{settings.timezone}</option>
          )}
        </select>
        <p className="text-xs text-slate-400 mt-2">
          Used for scheduled jobs like the attendance digest.
        </p>
      </section>

      {/* Attendance digest */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Daily Attendance Digest
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Email all admins a summary of today's absences, late arrivals, and excused absences.
          Useful for updating external attendance systems.
        </p>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-700">Send daily digest</span>
          <Toggle
            checked={settings.attendanceDigestEnabled}
            onChange={v => updateField('attendanceDigestEnabled', v)}
          />
        </div>
        {settings.attendanceDigestEnabled && (
          <div className="flex items-end gap-3 pl-1">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Send time ({settings.timezone})
              </label>
              <input
                type="time"
                value={settings.attendanceDigestTime || ''}
                onChange={e => updateField('attendanceDigestTime', e.target.value || null)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
            </div>
            <p className="text-xs text-slate-400 pb-2.5">
              {settings.attendanceDigestTime
                ? `Digest sends at ${settings.attendanceDigestTime} each day to every admin.`
                : 'Set a time to enable sending.'}
            </p>
          </div>
        )}
      </section>

      {/* Module toggles */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">Modules</h2>
          <p className="text-xs text-slate-400">
            Turn off any feature you're not using. Disabled modules are hidden from sidebars and apps.
          </p>
        </div>
        {MODULE_GROUPS.map(group => (
          <div key={group.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">{group.label}</p>
            <div className="space-y-3">
              {group.flags.map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                  </div>
                  <Toggle
                    checked={!!settings[key]}
                    onChange={v => updateField(key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
