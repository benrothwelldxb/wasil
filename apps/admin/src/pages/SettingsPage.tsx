import React, { useEffect, useState } from 'react'
import { Save, Mail, Clock, Globe, Phone, FlaskConical, Copy, Trash2, RefreshCw, AlertTriangle, Check } from 'lucide-react'
import { useToast, api, PARENT_BOTTOM_NAV_CATALOG, DEFAULT_BOTTOM_NAV_KEYS, isNavItemAvailable } from '@wasil/shared'
import type { SchoolSettings, SchoolModuleFlag, TestAccountInfo, BottomNavKey } from '@wasil/shared'

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

      {/* Contact-details confirmation */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
          <Phone className="w-4 h-4" />
          Parent Contact Confirmation
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Periodically prompt parents to confirm their mobile number is still
          correct. The prompt is a non-dismissable modal — they confirm "still
          mine" or update it before continuing.
        </p>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Re-prompt after (days)
            </label>
            <input
              type="number"
              min={0}
              max={3650}
              value={settings.contactConfirmDays}
              onChange={e => {
                const v = parseInt(e.target.value, 10)
                updateField('contactConfirmDays', Number.isNaN(v) ? 0 : v)
              }}
              className="w-28 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
          </div>
          <p className="text-xs text-slate-500 pb-2.5">
            {settings.contactConfirmDays === 0
              ? 'Disabled — parents are never prompted.'
              : `Parents are prompted every ${settings.contactConfirmDays} days.`}
          </p>
        </div>
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

      <BottomNavSection settings={settings} onChange={keys => updateField('bottomNavItems', keys)} />

      <TestAccountsSection />
    </div>
  )
}

// Parent app bottom tab bar: Home and More are fixed; the admin picks the three
// middle items here. Only modules that are currently enabled are offered, and a
// destination can't be chosen twice. Empty slots are allowed (the parent bar
// backfills from its default set).
function BottomNavSection({ settings, onChange }: { settings: SchoolSettings; onChange: (keys: BottomNavKey[]) => void }) {
  const available = PARENT_BOTTOM_NAV_CATALOG.filter(item => isNavItemAvailable(item, settings))
  const selected = (settings.bottomNavItems && settings.bottomNavItems.length > 0)
    ? settings.bottomNavItems
    : DEFAULT_BOTTOM_NAV_KEYS
  const slots: (BottomNavKey | '')[] = [0, 1, 2].map(i => selected[i] ?? '')
  const labelFor = (key: string) => PARENT_BOTTOM_NAV_CATALOG.find(i => i.key === key)?.label ?? key

  const changeSlot = (index: number, key: string) => {
    const next: (BottomNavKey | '')[] = [...slots]
    next[index] = (key || '') as BottomNavKey | ''
    // A destination can only sit in one slot — clear it from any other.
    if (key) for (let j = 0; j < next.length; j++) if (j !== index && next[j] === key) next[j] = ''
    onChange(next.filter((k): k is BottomNavKey => !!k))
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-700">Parent app bottom bar</h2>
        <p className="text-xs text-slate-500 mt-1">
          The parent app's bottom bar has five slots: <strong>Home</strong> and <strong>More</strong> are
          fixed; choose the three in between. Only enabled modules can be chosen; leave a slot as
          "Default" to use the app's default for it.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => {
          const current = slots[i]
          // Offer available items not already used in another slot (plus the current one).
          const options = available.filter(item => item.key === current || !slots.some((s, j) => j !== i && s === item.key))
          return (
            <div key={i}>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Slot {i + 1}</label>
              <select
                value={current}
                onChange={e => changeSlot(i, e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
              >
                <option value="">Default</option>
                {options.map(item => (
                  <option key={item.key} value={item.key}>{labelFor(item.key)}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-2 pt-1 text-xs text-slate-400">
        <span className="font-semibold text-slate-500">Preview:</span>
        <span>Home</span>
        {slots.map((s, i) => <span key={i}>· {s ? labelFor(s) : '—'}</span>)}
        <span>· More</span>
      </div>
    </section>
  )
}

// Staff backdoor into the live parent experience: one Test Parent + Test Student
// per class. They sign in with the class email + the env-configured TEST_LOGIN_CODE
// and see the real parent app for that class. Excluded from analytics + staff views.
function TestAccountsSection() {
  const toast = useToast()
  const [accounts, setAccounts] = useState<TestAccountInfo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [codeStatus, setCodeStatus] = useState<'set' | 'NOT SET' | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const load = async () => {
    try {
      const res = await api.testAccounts.list()
      setAccounts(res.testAccounts)
    } catch {
      setAccounts([])
    }
  }
  useEffect(() => { load() }, [])

  const handleProvision = async () => {
    setBusy(true)
    try {
      const res = await api.testAccounts.provision()
      setCodeStatus(res.loginCode)
      await load()
      toast.success(`Provisioned ${res.provisioned.length} class account${res.provisioned.length === 1 ? '' : 's'}`)
    } catch {
      toast.error('Failed to provision test accounts')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setConfirmRemove(false)
    setBusy(true)
    try {
      const res = await api.testAccounts.remove()
      setAccounts([])
      setCodeStatus(null)
      toast.success(`Removed ${res.removedParents} account${res.removedParents === 1 ? '' : 's'}`)
    } catch {
      toast.error('Failed to remove test accounts')
    } finally {
      setBusy(false)
    }
  }

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(email)
      setTimeout(() => setCopied(c => (c === email ? null : c)), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-violet-500" />
            Test accounts
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xl">
            A login into the <strong>live</strong> parent app for each class — sign in on your phone with a class
            email plus your test code to see exactly what that class's parents see. Test pupils are hidden from
            registers, attendance and reports, and excluded from all analytics.
          </p>
        </div>
        <button
          onClick={handleProvision}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          {accounts && accounts.length > 0 ? 'Refresh / add new classes' : 'Provision test accounts'}
        </button>
      </div>

      {codeStatus === 'NOT SET' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Accounts are created, but <strong>TEST_LOGIN_CODE isn't set</strong> on the server yet, so nobody can
            sign in. Set that environment variable in Railway, then these logins will work with it.
          </span>
        </div>
      )}

      {accounts === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-slate-500">
          No test accounts yet. Provisioning creates one per class — safe to run again whenever you add classes.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Class</th>
                  <th className="text-left font-medium px-3 py-2">Sign-in email</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map(a => (
                  <tr key={a.classId}>
                    <td className="px-3 py-2 text-slate-700">{a.className}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{a.email}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => copyEmail(a.email)}
                        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
                      >
                        {copied === a.email ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied === a.email ? 'Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Sign in at the parent app with any email above + your configured test code.
            </p>
            {confirmRemove ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Remove all test accounts?</span>
                <button onClick={handleRemove} disabled={busy} className="font-medium text-red-600 hover:text-red-700">Yes, remove</button>
                <button onClick={() => setConfirmRemove(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove all
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
