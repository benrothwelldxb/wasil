import React from 'react'
import { useTheme, useApi, api } from '@wasil/shared'
import type {
  AnalyticsOverview,
  AnalyticsMessagesResponse,
  EngagementTrendResponse,
  EcaStatsResponse,
} from '@wasil/shared'
import {
  Users,
  UserCheck,
  Mail,
  ClipboardCheck,
  Star,
  TrendingUp,
  BarChart3,
  Sparkles,
} from 'lucide-react'

export function AnalyticsDashboardPage() {
  const theme = useTheme()
  const { data: overview, isLoading: loadingOverview } = useApi<AnalyticsOverview>(
    () => api.analytics.overview(),
    []
  )
  const { data: messagesData, isLoading: loadingMessages } = useApi<AnalyticsMessagesResponse>(
    () => api.analytics.messages(),
    []
  )
  const { data: trend, isLoading: loadingTrend } = useApi<EngagementTrendResponse>(
    () => api.analytics.engagementTrend(),
    []
  )
  const { data: ecaStats, isLoading: loadingEca } = useApi<EcaStatsResponse>(
    () => api.analytics.ecaStats(),
    []
  )

  const brandColor = theme.colors.brandColor || '#7f0029'
  const roseColor = '#C4506E'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Platform engagement and adoption metrics for {theme.schoolName}
        </p>
      </div>

      {/* Top row - Key metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          label="Total Parents"
          value={overview?.totalParents ?? '-'}
          subtitle={overview ? `${overview.adoptionRate}% adoption rate` : ''}
          loading={loadingOverview}
          color={brandColor}
        />
        <MetricCard
          icon={UserCheck}
          label="Active Parents"
          value={overview?.activeParents ?? '-'}
          subtitle="Last 30 days"
          loading={loadingOverview}
          color="#059669"
        />
        <MetricCard
          icon={Mail}
          label="Message Read Rate"
          value={overview ? `${overview.messageReadRate}%` : '-'}
          subtitle={overview ? `${overview.totalMessages} messages this month` : ''}
          loading={loadingOverview}
          color="#2563eb"
        />
        <MetricCard
          icon={ClipboardCheck}
          label="Form Completion"
          value={overview ? `${overview.formsCompletionRate}%` : '-'}
          subtitle="Forms with responses"
          loading={loadingOverview}
          color="#7c3aed"
        />
      </div>

      {/* Engagement trend chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-slate-400" />
          <h2 className="text-[15px] font-semibold text-slate-800">
            Weekly Engagement (12 weeks)
          </h2>
        </div>
        {loadingTrend ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">
            Loading trend data...
          </div>
        ) : trend && trend.weeks.length > 0 ? (
          <EngagementChart weeks={trend.weeks} color={roseColor} />
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">
            No engagement data available
          </div>
        )}
      </div>

      {/* Two-column layout: Messages table + ECA/Pulse */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Message performance table (2/3 width) */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-slate-400" />
            <h2 className="text-[15px] font-semibold text-slate-800">
              Message Performance
            </h2>
          </div>
          {loadingMessages ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">
              Loading messages...
            </div>
          ) : messagesData && messagesData.messages.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Message
                    </th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                      Date
                    </th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                      Target
                    </th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Read Rate
                    </th>
                    <th className="text-left py-2 text-xs font-medium text-slate-400 uppercase tracking-wider hidden md:table-cell">
                      Form
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {messagesData.messages.slice(0, 15).map(msg => (
                    <tr key={msg.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-4">
                        <span className="text-slate-800 font-medium truncate block max-w-[200px]">
                          {msg.title}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500 hidden md:table-cell whitespace-nowrap">
                        {msg.sentAt}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500 hidden lg:table-cell whitespace-nowrap">
                        {msg.targetClass}
                      </td>
                      <td className="py-2.5 pr-4 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(msg.readRate, 100)}%`,
                                backgroundColor: getProgressColor(msg.readRate),
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-600 w-10 text-right">
                            {msg.readRate}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 hidden md:table-cell">
                        {msg.hasForm ? (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              color: getProgressColor(msg.formCompletionRate),
                              backgroundColor: `${getProgressColor(msg.formCompletionRate)}15`,
                            }}
                          >
                            {msg.formCompletionRate}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">
              No messages yet
            </div>
          )}
        </div>

        {/* Right column: ECA + Pulse */}
        <div className="space-y-6">
          {/* ECA stats panel */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-slate-400" />
              <h2 className="text-[15px] font-semibold text-slate-800">
                ECA Participation
              </h2>
            </div>
            {loadingEca ? (
              <div className="h-32 flex items-center justify-center text-sm text-slate-400">
                Loading...
              </div>
            ) : ecaStats && ecaStats.totalActivities > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-xl font-bold text-slate-800">
                      {ecaStats.firstChoiceRate}%
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">1st Choice Rate</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-xl font-bold text-slate-800">
                      {ecaStats.averageActivitiesPerStudent}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Avg per Student</p>
                  </div>
                </div>
                {ecaStats.mostPopular.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                      Most Popular
                    </p>
                    <div className="space-y-2">
                      {ecaStats.mostPopular.map((act, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-slate-700 truncate flex-1 min-w-0">
                            {act.name}
                          </span>
                          <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${act.capacity > 0 ? Math.min((act.demand / act.capacity) * 100, 100) : 100}%`,
                                backgroundColor: roseColor,
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                            {act.demand}/{act.capacity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-sm text-slate-400">
                No ECA data available
              </div>
            )}
          </div>

          {/* Pulse survey summary */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-slate-400" />
              <h2 className="text-[15px] font-semibold text-slate-800">
                Parent Pulse
              </h2>
            </div>
            {loadingOverview ? (
              <div className="h-24 flex items-center justify-center text-sm text-slate-400">
                Loading...
              </div>
            ) : overview && overview.pulseAverageRating > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-3xl font-bold text-slate-800">
                      {overview.pulseAverageRating}
                    </p>
                    <div className="flex gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className="w-4 h-4"
                          fill={star <= Math.round(overview.pulseAverageRating) ? '#F59E0B' : 'none'}
                          stroke={star <= Math.round(overview.pulseAverageRating) ? '#F59E0B' : '#CBD5E1'}
                          strokeWidth={1.5}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Average Rating</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-2xl font-bold text-slate-800">
                      {overview.pulseResponseRate}%
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Response Rate</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center text-sm text-slate-400">
                No pulse survey data
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Sub-components ---

function MetricCard({
  icon: Icon,
  label,
  value,
  subtitle,
  loading,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  subtitle: string
  loading: boolean
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          {loading ? (
            <div className="h-8 w-20 bg-slate-100 rounded animate-pulse mb-1" />
          ) : (
            <p className="text-2xl font-bold text-slate-800">{value}</p>
          )}
          <p className="text-xs font-medium text-slate-500 mt-1">{label}</p>
          {subtitle && (
            <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}12` }}
        >
          <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  )
}

function EngagementChart({
  weeks,
  color,
}: {
  weeks: Array<{ week: string; label: string; activeUsers: number; messagesRead: number; formsCompleted: number }>
  color: string
}) {
  const maxValue = Math.max(...weeks.map(w => w.activeUsers), 1)

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 180 }}>
        {weeks.map((w, i) => {
          const height = (w.activeUsers / maxValue) * 160
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end group relative"
              style={{ height: 180 }}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-slate-800 text-white text-[10px] rounded-md px-2 py-1.5 whitespace-nowrap shadow-lg">
                  <p className="font-medium">{w.label}</p>
                  <p>Active: {w.activeUsers}</p>
                  <p>Read: {w.messagesRead}</p>
                  <p>Forms: {w.formsCompleted}</p>
                </div>
              </div>
              <div
                className="w-full rounded-t-sm transition-all hover:opacity-80"
                style={{
                  height: Math.max(height, 2),
                  backgroundColor: color,
                  opacity: 0.85,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 mt-2">
        {weeks.map((w, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[9px] text-slate-400 leading-none">
              {w.label.split(' ')[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function getProgressColor(rate: number): string {
  if (rate >= 80) return '#059669' // green
  if (rate >= 50) return '#D97706' // amber
  return '#DC2626' // red
}
