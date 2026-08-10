import { useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronRight,
  HelpCircle,
  LogOut,
  Mail,
  RefreshCw,
  Settings2,
  Shield,
  User,
  Users,
} from 'lucide-react'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Card } from '@/components/ui/Card'
import { SectionLabel } from '@/components/ui/states'
import { useActiveGroup } from '@/features/shared/useActiveGroup'
import { useSignOut } from '@/data/hooks'
import { provider, resetDemo } from '@/data'

interface Row {
  icon: typeof User
  label: string
  onClick?: () => void
  danger?: boolean
  hint?: string
}

function SettingsList({ label, rows }: { label: string; rows: Row[] }) {
  return (
    <section className="space-y-2">
      <SectionLabel className="px-1">{label}</SectionLabel>
      <Card>
        <ul className="divide-y divide-cream-200">
          {rows.map((r) => (
            <li key={r.label}>
              <button
                onClick={r.onClick}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-cream-100"
              >
                <r.icon size={19} className={r.danger ? 'text-coral' : 'text-ink-soft'} aria-hidden />
                <span className={`flex-1 font-medium ${r.danger ? 'text-coral' : 'text-ink'}`}>
                  {r.label}
                </span>
                {r.hint && <span className="text-xs text-ink-faint">{r.hint}</span>}
                {!r.danger && <ChevronRight size={18} className="text-ink-faint" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

export function SettingsScreen() {
  const navigate = useNavigate()
  const { groupId, group, isOrganiser } = useActiveGroup()
  const signOut = useSignOut()

  async function logout() {
    await signOut.mutateAsync()
    navigate('/')
  }

  return (
    <div className="space-y-6">
      <ScreenHeader title="Settings" onBack={undefined} />

      <SettingsList
        label="Account"
        rows={[
          { icon: User, label: 'Edit my profile', onClick: () => navigate('/app/profile') },
          { icon: Bell, label: 'Notifications', hint: 'On' },
          { icon: Shield, label: 'Privacy' },
        ]}
      />

      <SettingsList
        label="Group"
        rows={[
          {
            icon: Settings2,
            label: 'Group details',
            onClick: () => (isOrganiser ? navigate('/hq/settings') : navigate('/hq')),
          },
          {
            icon: Mail,
            label: 'Invite members',
            onClick: () => groupId && navigate(`/hq/invite/${groupId}`),
          },
          {
            icon: Users,
            label: isOrganiser ? 'Manage group' : 'Group members',
            onClick: () => navigate(isOrganiser ? '/hq/participants' : '/hq'),
          },
        ]}
      />

      <SettingsList
        label="Support"
        rows={[
          { icon: HelpCircle, label: 'Help & FAQs' },
          { icon: Mail, label: 'Contact us' },
        ]}
      />

      {provider.kind === 'local' && (
        <SettingsList
          label="Demo"
          rows={[
            {
              icon: RefreshCw,
              label: 'Reset demo data',
              onClick: () => {
                resetDemo()
                window.location.assign('/app')
              },
            },
          ]}
        />
      )}

      <div className="px-1">
        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 py-3 font-semibold text-coral"
        >
          <LogOut size={18} aria-hidden /> Log out
        </button>
        {group && (
          <p className="pt-1 text-center text-xs text-ink-faint">
            {group.name} · code {group.join_code}
          </p>
        )}
      </div>
    </div>
  )
}
