import React from 'react'
import { useTheme, useApi, api } from '@wasil/shared'
import type {
  LaunchAnalytics,
  ActiveTrendResponse,
  FeatureUsageResponse,
  ByClassResponse,
  NotActivatedResponse,
} from '@wasil/shared'
import {
  UserCheck,
  Rocket,
  Bell,
  Activity,
  Download,
  Inbox,
  Send,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Star,
  Trophy,
  ArrowRight,
} from 'lucide-react'

export function AnalyticsDashboardPage() {
  const theme = useTheme()

  const { data: launch, isLoading: loadingLaunch } = useApi<LaunchAnalytics>(
    () => api.analytics.launch(),
    []
  )
  const { data: trend, isLoading: loadingTrend } = useApi<ActiveTrendResponse>(
    () => api.analytics.activeTrend(30),
    []
  )
  const { data: featureUsage, isLoading: loadingFeatures } = useApi<FeatureUsageResponse>(
    () => api.analytics.featureUsage(),
    []
  )
  const { data: byClass, isLoading: loadingClasses } = useApi<ByClassResponse>(
    () => api.analytics.byClass(),
    []
  )
  const { data: notActivated, isLoading: loadingNotActivated } = useApi<NotActivatedResponse>(
    () => api.analytics.notActivated(),
    []
  )

  const brandColor = theme.colors.brandColor || '#7f0029'
  const roseColor = '#C4506E'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Launch Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Pilot adoption and engagement for {theme.schoolName}
        </p>
      </div>

      <LaunchScorecard data={launch} loading={loadingLaunch} brandColor={brandColor} />

      <GrowthCurveSection data={trend} loading={loadingTrend} color={roseColor} />

      <FeatureEngagementSection data={featureUsage} loading={loadingFeatures} />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3">
          <CohortLeagueTable data={byClass} loading={loadingClasses} brandColor={brandColor} />
        </div>
        <div className="xl:col-span-2">
          <NotActivatedSection data={notActivated} loading={loadingNotActivated} />
        </div>
      </div>
    </div>
  )
}

// --- Section 1: Launch scorecard (hero) ---

function LaunchScorecard({
  data,
  loading,
  brandColor,
}: {
  data: LaunchAnalytics | null
  loading: boolean
  brandColor: string
}) {
  const funnel = data?.funnel
  const steps = funnel
    ? [
        { label: 'Total parents', value: funnel.totalParents },
        { label: 'Invited', value: funnel.invited },
        { label: 'Activated', value: funnel.activated },
        { label: 'Active (30d)', value: funnel.active30 },
      ]
    : []

  return (
    <div
      className="rounded-2xl border border-slate-200 p-6 sm:p-8"
      style={{
        background: `linear-gradient(135deg, ${brandColor}0d 0%, ${brandColor}03 60%, transparent 100%)`,
      }}
    >
      <div className="flex items-center gap-2 mb-6">
        <Rocket className="w-5 h-5" style={{ color: brandColor }} />
        <h2 className="text-[15px] font-semibold text-slate-800">Launch Scorecard</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Funnel (3/5 width) */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="h-40 flex items-end gap-3">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="flex-1 h-full bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : funnel ? (
            <FunnelChart steps={steps} brandColor={brandColor} />
          ) : (
            <EmptyState height="h-40" text="No funnel data yet" />
          )}
        </div>

        {/* Headline stats (2/5 width) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <HeroStat
            icon={Trophy}
            label="Activation rate"
            value={loading ? null : data ? `${data.activationRate}%` : '—'}
            subtitle={
              data ? `${data.funnel.activated} of ${data.funnel.totalParents} parents signed in` : ''
            }
            color={brandColor}
            emphasized
          />
          <div className="grid grid-cols-2 gap-4">
            <HeroStat
              icon={Bell}
              label="Notifications on"
              value={loading ? null : data ? `${data.pushAdoption.pct}%` : '—'}
              subtitle={data ? `${data.pushAdoption.count} parents` : ''}
              color="#2563eb"
              compact
            />
            <HeroStat
              icon={Activity}
              label="Active this week"
              value={loading ? null : data ? data.funnel.active7 : '—'}
              subtitle={
                data && data.funnel.totalParents > 0
                  ? `${pct(data.funnel.active7, data.funnel.totalParents)}% of parents`
                  : ''
              }
              color="#059669"
              compact
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function FunnelChart({
  steps,
  brandColor,
}: {
  steps: Array<{ label: string; value: number }>
  brandColor: string
}) {
  const max = Math.max(...steps.map(s => s.value), 1)

  return (
    <div className="flex items-stretch gap-1.5 sm:gap-3">
      {steps.map((step, i) => {
        const widthPct = Math.max((step.value / max) * 100, step.value > 0 ? 8 : 4)
        const prev = i > 0 ? steps[i - 1].value : null
        const stepPct = prev != null ? pct(step.value, prev) : null
        return (
          <React.Fragment key={step.label}>
            <div className="flex-1 flex flex-col justify-end">
              <div className="text-2xl font-bold text-slate-800 tabular-nums">{step.value}</div>
              <div className="text-xs font-medium text-slate-500 mb-2 truncate">{step.label}</div>
              <div className="h-24 flex items-end bg-slate-100 rounded-lg overflow-hidden">
                <div
                  className="w-full rounded-lg transition-all"
                  style={{
                    height: `${widthPct}%`,
                    backgroundColor: brandColor,
                    opacity: 0.35 + (i / Math.max(steps.length - 1, 1)) * 0.65,
                  }}
                />
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex flex-col items-center justify-center px-0.5 flex-shrink-0 self-end pb-9">
                <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                {stepPct != null && (
                  <span className="text-[10px] font-medium text-slate-400 mt-0.5 whitespace-nowrap">
                    {stepPct}%
                  </span>
                )}
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function HeroStat({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
  emphasized,
  compact,
}: {
  icon: React.ElementType
  label: string
  value: string | number | null
  subtitle: string
  color: string
  emphasized?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={`rounded-xl bg-white border border-slate-200 ${compact ? 'p-3.5' : 'p-5'} flex flex-col justify-between`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`font-medium text-slate-500 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {label}
        </span>
        <div
          className={`rounded-lg flex items-center justify-center flex-shrink-0 ${compact ? 'w-7 h-7' : 'w-9 h-9'}`}
          style={{ backgroundColor: `${color}12` }}
        >
          <Icon className={compact ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5'} style={{ color }} strokeWidth={1.8} />
        </div>
      </div>
      {value === null ? (
        <div className={`bg-slate-100 rounded animate-pulse ${emphasized ? 'h-10 w-24' : 'h-7 w-16'}`} />
      ) : (
        <p
          className={`font-bold tabular-nums ${emphasized ? 'text-4xl' : 'text-2xl'}`}
          style={{ color: emphasized ? color : '#1e293b' }}
        >
          {value}
        </p>
      )}
      {subtitle && <p className="text-[11px] text-slate-400 mt-1">{subtitle}</p>}
    </div>
  )
}

// --- Section 2: Growth curve ---

function GrowthCurveSection({
  data,
  loading,
  color,
}: {
  data: ActiveTrendResponse | null
  loading: boolean
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-slate-400" />
          <h2 className="text-[15px] font-semibold text-slate-800">Growth Curve</h2>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xl font-bold text-slate-800 tabular-nums">
              {loading ? '—' : data ? data.wau : '—'}
            </p>
            <p className="text-[11px] text-slate-400">WAU</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-slate-800 tabular-nums">
              {loading ? '—' : data ? data.mau : '—'}
            </p>
            <p className="text-[11px] text-slate-400">MAU</p>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="h-48 flex items-center justify-center text-sm text-slate-400">
          Loading trend data...
        </div>
      ) : data && data.points.length > 0 ? (
        <TrendAreaChart points={data.points} color={color} />
      ) : (
        <EmptyState height="h-48" text="No activity recorded yet — check back once parents start signing in" />
      )}
    </div>
  )
}

function TrendAreaChart({
  points,
  color,
}: {
  points: Array<{ date: string; activeUsers: number }>
  color: string
}) {
  const width = 1000
  const height = 200
  const padding = 8
  const max = Math.max(...points.map(p => p.activeUsers), 1)
  const n = points.length

  const xFor = (i: number) => (n <= 1 ? width / 2 : padding + (i / (n - 1)) * (width - padding * 2))
  const yFor = (v: number) => padding + (1 - v / max) * (height - padding * 2)

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.activeUsers)}`)
    .join(' ')
  const areaPath = `${linePath} L ${xFor(n - 1)} ${height - padding} L ${xFor(0)} ${height - padding} Z`

  const sparse = n < 4
  const first = points[0]?.date
  const last = points[n - 1]?.date

  return (
    <div>
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#growthFill)" />
          <path d={linePath} fill="none" stroke={color} strokeWidth={sparse ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <circle
              key={p.date}
              cx={xFor(i)}
              cy={yFor(p.activeUsers)}
              r={sparse ? 5 : n > 20 ? 0 : 3}
              fill={i === n - 1 ? color : '#fff'}
              stroke={color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            >
              <title>
                {p.date}: {p.activeUsers} active
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
        <span>{first}</span>
        <span>{last}</span>
      </div>
      {sparse && (
        <p className="text-[11px] text-slate-400 mt-1">
          Early days — the curve will fill in as more days of activity land.
        </p>
      )}
    </div>
  )
}

// --- Section 3: Feature engagement ---

function FeatureEngagementSection({
  data,
  loading,
}: {
  data: FeatureUsageResponse | null
  loading: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="w-5 h-5 text-slate-400" />
        <h2 className="text-[15px] font-semibold text-slate-800">Feature Engagement</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <FeatureCardSkeleton key={i} />)
        ) : data ? (
          <>
            <FeatureCard
              icon={Inbox}
              title="Inbox"
              rate={data.inbox.replyRate}
              rateLabel="Reply rate"
              rows={[
                ['Threads', data.inbox.threads],
                ['Parent messages', data.inbox.parentMessages],
              ]}
            />
            <FeatureCard
              icon={Send}
              title="Posts"
              rate={data.posts.readRate}
              rateLabel="Read rate"
              rows={[['Sent', data.posts.sent]]}
            />
            <FeatureCard
              icon={CalendarCheck}
              title="Events"
              rate={data.events.rsvpRate}
              rateLabel="RSVP rate"
              rows={[
                ['Events', data.events.count],
                ['RSVPs', data.events.rsvps],
              ]}
            />
            <FeatureCard
              icon={ClipboardCheck}
              title="Forms"
              rate={data.forms.completionRate}
              rateLabel="Completion rate"
              rows={[['Sent', data.forms.sent]]}
            />
            <FeatureCard
              icon={ClipboardList}
              title="Attendance"
              rate={null}
              rateLabel=""
              rows={[['Parent requests', data.attendance.parentRequests]]}
            />
            <FeatureCard
              icon={Star}
              title="Pulse"
              rate={data.pulse.responseRate}
              rateLabel="Response rate"
              rows={[['Sent', data.pulse.sent]]}
              footer={
                data.pulse.avgScore > 0 ? (
                  <div className="flex items-center gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        className="w-3.5 h-3.5"
                        fill={star <= Math.round(data.pulse.avgScore) ? '#F59E0B' : 'none'}
                        stroke={star <= Math.round(data.pulse.avgScore) ? '#F59E0B' : '#CBD5E1'}
                        strokeWidth={1.5}
                      />
                    ))}
                    <span className="text-xs font-medium text-slate-600 ml-1 tabular-nums">
                      {data.pulse.avgScore.toFixed(1)}/5
                    </span>
                  </div>
                ) : null
              }
            />
          </>
        ) : (
          <div className="col-span-full">
            <EmptyState height="h-32" text="No feature usage data available" />
          </div>
        )}
      </div>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  rate,
  rateLabel,
  rows,
  footer,
}: {
  icon: React.ElementType
  title: string
  rate: number | null
  rateLabel: string
  rows: Array<[string, number]>
  footer?: React.ReactNode
}) {
  const color = rate == null ? '#64748b' : getProgressColor(rate)
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
          <span className="text-sm font-semibold text-slate-800">{title}</span>
        </div>
        {rate != null && <ProgressRing pct={rate} color={color} />}
      </div>
      {rate != null && (
        <p className="text-[11px] text-slate-400 -mt-2 mb-3">{rateLabel}</p>
      )}
      <div className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium text-slate-800 tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      {footer}
    </div>
  )
}

function FeatureCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
        <div className="h-10 w-10 bg-slate-100 rounded-full animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full bg-slate-50 rounded animate-pulse" />
        <div className="h-3 w-2/3 bg-slate-50 rounded animate-pulse" />
      </div>
    </div>
  )
}

function ProgressRing({ pct, color, size = 40 }: { pct: number; color: string; size?: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-slate-700 tabular-nums">{Math.round(clamped)}%</span>
      </div>
    </div>
  )
}

// --- Section 4: Cohort league table ---

function CohortLeagueTable({
  data,
  loading,
  brandColor,
}: {
  data: ByClassResponse | null
  loading: boolean
  brandColor: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-slate-400" />
        <h2 className="text-[15px] font-semibold text-slate-800">Cohort League Table</h2>
      </div>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : data && data.classes.length > 0 ? (
        <div className="space-y-3">
          {data.classes.map(cls => (
            <div key={cls.id} className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700 w-24 sm:w-32 truncate flex-shrink-0">
                {cls.name}
              </span>
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(cls.activePct, cls.activePct > 0 ? 2 : 0)}%`,
                    backgroundColor: getProgressColor(cls.activePct, brandColor),
                  }}
                />
              </div>
              <span className="text-xs text-slate-500 w-16 text-right flex-shrink-0 tabular-nums">
                {cls.activatedParents}/{cls.totalParents}
              </span>
              <span className="text-xs font-semibold text-slate-700 w-10 text-right flex-shrink-0 tabular-nums">
                {cls.activePct}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState height="h-32" text="No classes with linked parents yet" />
      )}
    </div>
  )
}

// --- Section 5: Not-yet-activated parents ---

function NotActivatedSection({
  data,
  loading,
}: {
  data: NotActivatedResponse | null
  loading: boolean
}) {
  const handleDownload = () => {
    if (!data || data.parents.length === 0) return
    const header = 'Name,Email,Class'
    const rows = data.parents.map(p =>
      [p.name, p.email, p.className ?? ''].map(csvEscape).join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'not-activated-parents.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-slate-400" />
          <h2 className="text-[15px] font-semibold text-slate-800">Not Yet Activated</h2>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!data || data.parents.length === 0}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download CSV
        </button>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-slate-50 rounded animate-pulse" />
          ))}
        </div>
      ) : data && data.parents.length > 0 ? (
        <div className="overflow-y-auto max-h-80 -mx-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 px-1 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left py-2 px-1 text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">
                  Email
                </th>
                <th className="text-left py-2 px-1 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Class
                </th>
              </tr>
            </thead>
            <tbody>
              {data.parents.map(p => (
                <tr key={p.userId} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 px-1 text-slate-800 truncate max-w-[140px]">{p.name}</td>
                  <td className="py-2 px-1 text-slate-500 hidden sm:table-cell truncate max-w-[180px]">
                    {p.email}
                  </td>
                  <td className="py-2 px-1 text-slate-500 whitespace-nowrap">
                    {p.className ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState height="h-32" text="Everyone's signed in 🎉" />
        </div>
      )}
    </div>
  )
}

// --- Shared helpers ---

function EmptyState({ height, text }: { height: string; text: string }) {
  return (
    <div className={`${height} flex items-center justify-center text-sm text-slate-400 text-center px-4`}>
      {text}
    </div>
  )
}

function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

function csvEscape(value: string): string {
  if (value == null) return ''
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function getProgressColor(rate: number, brandColor?: string): string {
  if (rate >= 80) return '#059669' // green
  if (rate >= 50) return '#D97706' // amber
  if (rate > 0) return '#DC2626' // red
  return brandColor ? `${brandColor}40` : '#CBD5E1'
}
