import React, { useState } from 'react'
import { AlertTriangle, Shield, Cloud, Clock, Heart, Siren, Send, CheckCircle, RefreshCw, ChevronDown, X, Eye } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'
import type { EmergencyAlert, AlertType, AlertSeverity, Class } from '@wasil/shared'

const ALERT_TYPES: { value: AlertType; label: string; icon: React.ElementType }[] = [
  { value: 'LOCKDOWN', label: 'Lockdown', icon: Shield },
  { value: 'WEATHER', label: 'Weather', icon: Cloud },
  { value: 'EARLY_DISMISSAL', label: 'Early Dismissal', icon: Clock },
  { value: 'MEDICAL', label: 'Medical', icon: Heart },
  { value: 'SECURITY', label: 'Security', icon: Siren },
  { value: 'GENERAL', label: 'General', icon: AlertTriangle },
]

const SEVERITY_OPTIONS: { value: AlertSeverity; label: string; color: string }[] = [
  { value: 'CRITICAL', label: 'Critical', color: '#DC2626' },
  { value: 'HIGH', label: 'High', color: '#EA580C' },
  { value: 'MEDIUM', label: 'Medium', color: '#F59E0B' },
]

interface AlertTemplate {
  label: string
  icon: React.ElementType
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  color: string
}

const ALERT_TEMPLATES: AlertTemplate[] = [
  {
    label: 'Lockdown',
    icon: Shield,
    type: 'LOCKDOWN',
    severity: 'CRITICAL',
    title: 'School Lockdown in Effect',
    message: 'The school is currently in lockdown. All students are safe and accounted for. Please do NOT come to the school at this time. We will provide updates as the situation develops. Follow the instructions of emergency services.',
    color: '#DC2626',
  },
  {
    label: 'Early Closure',
    icon: Clock,
    type: 'EARLY_DISMISSAL',
    severity: 'HIGH',
    title: 'Early School Closure Today',
    message: 'Due to unforeseen circumstances, school will close early today. Please arrange to collect your child by [TIME]. After-school clubs and activities are cancelled. If you are unable to collect, please contact the school office immediately.',
    color: '#EA580C',
  },
  {
    label: 'Severe Weather',
    icon: Cloud,
    type: 'WEATHER',
    severity: 'HIGH',
    title: 'School Closed Due to Weather',
    message: 'School will be CLOSED tomorrow due to severe weather conditions. Online learning will be available via the student portal. Please check for further updates in the morning before travelling. Stay safe.',
    color: '#5B8EC4',
  },
  {
    label: 'Security Alert',
    icon: Siren,
    type: 'SECURITY',
    severity: 'CRITICAL',
    title: 'Security Incident Near School',
    message: 'We are aware of a security incident in the area surrounding the school. As a precaution, all entry and exit points have been secured. All children are safe inside the building. Pick-up arrangements may be affected — we will update you shortly.',
    color: '#8B6EAE',
  },
  {
    label: 'Medical Emergency',
    icon: Heart,
    type: 'MEDICAL',
    severity: 'HIGH',
    title: 'Important Health Notice',
    message: 'We are writing to inform you of a confirmed case of [ILLNESS] at the school. Please be vigilant for symptoms including [SYMPTOMS]. If your child is unwell, please keep them at home and consult your GP. The school has been deep cleaned as a precaution.',
    color: '#E8785B',
  },
  {
    label: 'Utilities / Closure',
    icon: AlertTriangle,
    type: 'GENERAL',
    severity: 'MEDIUM',
    title: 'School Closure — Facilities Issue',
    message: 'Due to a [water/power/heating] issue, the school will be closed tomorrow while repairs are carried out. Online learning resources will be available via the student portal. We apologise for the inconvenience and will update you once the issue is resolved.',
    color: '#E8A54B',
  },
]

interface AckEntry {
  parentId: string
  parentName: string
  parentEmail: string
  acknowledgedAt: string
  device?: string
}

interface AckData {
  totalParents: number
  acknowledged: number
  rate: number
  acknowledgments: AckEntry[]
}

export function EmergencyAlertsPage() {
  const theme = useTheme()
  const toast = useToast()
  const { data: alerts, refetch: refetchAlerts } = useApi<EmergencyAlert[]>(() => api.emergencyAlerts.list(), [])
  const { data: classes } = useApi<Class[]>(() => api.classes.list(), [])

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<AlertType>('GENERAL')
  const [severity, setSeverity] = useState<AlertSeverity>('HIGH')
  const [targetClass, setTargetClass] = useState<string>('')
  const [sendPush, setSendPush] = useState(true)
  const [sendSms, setSendSms] = useState(false)
  const [sendWhatsapp, setSendWhatsapp] = useState(false)
  const [sendEmail, setSendEmail] = useState(false)
  const [isDrill, setIsDrill] = useState(false)
  const [drillName, setDrillName] = useState('')
  const [requireAck, setRequireAck] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  // Acknowledgment modal state
  const [ackModalAlertId, setAckModalAlertId] = useState<string | null>(null)
  const [ackModalAlertTitle, setAckModalAlertTitle] = useState('')
  const [ackData, setAckData] = useState<AckData | null>(null)
  const [ackLoading, setAckLoading] = useState(false)

  const activeAlerts = (alerts || []).filter(a => a.status === 'ACTIVE')
  const resolvedAlerts = (alerts || []).filter(a => a.status === 'RESOLVED')

  const handleSend = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.emergencyAlerts.create({
        title,
        message,
        type,
        severity,
        targetClass: targetClass || undefined,
        sendPush,
        sendSms,
        sendWhatsapp,
        sendEmail,
        isDrill,
        drillName: isDrill ? drillName : undefined,
        requireAck,
      })
      setTitle('')
      setMessage('')
      setType('GENERAL')
      setSeverity('HIGH')
      setTargetClass('')
      setSendPush(true)
      setSendSms(false)
      setSendWhatsapp(false)
      setSendEmail(false)
      setIsDrill(false)
      setDrillName('')
      setRequireAck(false)
      refetchAlerts()
    } catch (error) {
      toast.error(`Failed to send alert: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResolve = async (id: string) => {
    setResolvingId(id)
    try {
      await api.emergencyAlerts.resolve(id)
      refetchAlerts()
    } catch (error) {
      toast.error(`Failed to resolve: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setResolvingId(null)
    }
  }

  const handleResend = async (id: string) => {
    setResendingId(id)
    try {
      const result = await api.emergencyAlerts.resend(id)
      toast.success(result.message)
      refetchAlerts()
    } catch (error) {
      toast.error(`Failed to resend: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setResendingId(null)
    }
  }

  const openAckModal = async (alertId: string, alertTitle: string) => {
    setAckModalAlertId(alertId)
    setAckModalAlertTitle(alertTitle)
    setAckData(null)
    setAckLoading(true)
    try {
      const data = await api.emergencyAlerts.getAcknowledgments(alertId)
      setAckData(data as AckData)
    } catch (error) {
      toast.error('Failed to load acknowledgment data')
    } finally {
      setAckLoading(false)
    }
  }

  const closeAckModal = () => {
    setAckModalAlertId(null)
    setAckModalAlertTitle('')
    setAckData(null)
  }

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'CRITICAL': return '#DC2626'
      case 'HIGH': return '#EA580C'
      case 'MEDIUM': return '#F59E0B'
      default: return '#6B7280'
    }
  }

  const getDeliveryTotal = (stats: EmergencyAlert['deliveryStats']) => {
    if (!stats) return { sent: 0, delivered: 0, failed: 0, pending: 0 }
    let sent = 0, delivered = 0, failed = 0, pending = 0
    Object.values(stats).forEach(ch => {
      sent += ch.sent
      delivered += ch.delivered
      failed += ch.failed
      pending += ch.pending
    })
    return { sent, delivered, failed, pending }
  }

  const renderAckSection = (a: EmergencyAlert) => {
    if (!(a as any).requireAck) return null
    const ackCount = (a as any).ackCount ?? 0
    const ackTotal = (a as any).ackTotal ?? 0
    const pct = ackTotal > 0 ? Math.round((ackCount / ackTotal) * 100) : 0

    return (
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-600">
            {ackCount} of {ackTotal} parents acknowledged ({pct}%)
          </span>
          <button
            onClick={() => openAckModal(a.id, a.title)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            <Eye className="h-3 w-3" />
            View Acknowledgments
          </button>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${pct}%`,
              backgroundColor: pct === 100 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#3B82F6',
            }}
          />
        </div>
      </div>
    )
  }

  const renderAlertCard = (a: EmergencyAlert, isActive: boolean) => {
    const totals = getDeliveryTotal(a.deliveryStats)
    const alertIsDrill = (a as any).isDrill
    const alertDrillName = (a as any).drillName
    const borderColor = alertIsDrill ? 'border-blue-200' : isActive ? 'border-red-200' : 'border-slate-200'
    const borderWidth = isActive || alertIsDrill ? 'border-2' : 'border'

    return (
      <div key={a.id} className={`bg-white rounded-xl ${borderWidth} ${borderColor} shadow-sm p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white ${!isActive ? 'opacity-70' : ''}`}
                style={{ backgroundColor: getSeverityColor(a.severity) }}
              >
                {a.severity}
              </span>
              {alertIsDrill && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold text-white bg-blue-500">
                  DRILL
                </span>
              )}
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {a.type.replace('_', ' ')}
              </span>
              {!isActive && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Resolved
                </span>
              )}
              <span className="text-xs text-slate-400">{getTimeAgo(a.sentAt)}</span>
            </div>
            <h3 className="font-semibold text-slate-900 mt-1">{a.title}</h3>
            {alertIsDrill && alertDrillName && (
              <p className="text-xs font-medium text-blue-600 mt-0.5">{alertDrillName}</p>
            )}
            <p className={`text-sm mt-1 ${isActive ? 'text-slate-600' : 'text-slate-500'}`}>{a.message}</p>
            <div className={`flex items-center gap-4 mt-${isActive ? '3' : '2'} text-xs ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>
              {a.targetClass && <span>Target: {a.targetClass}</span>}
              <span>Sent: {totals.sent + totals.delivered}</span>
              {totals.failed > 0 && <span className={`font-medium ${isActive ? 'text-red-600' : 'text-red-500'}`}>Failed: {totals.failed}</span>}
              <span>By: {a.createdBy}</span>
              {!isActive && a.resolvedBy && <span>Resolved by: {a.resolvedBy}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {totals.failed > 0 && (
              <button
                onClick={() => handleResend(a.id)}
                disabled={resendingId === a.id}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${resendingId === a.id ? 'animate-spin' : ''}`} />
                Resend Failed
              </button>
            )}
            {isActive && (
              <button
                onClick={() => handleResolve(a.id)}
                disabled={resolvingId === a.id}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {resolvingId === a.id ? 'Resolving...' : 'Resolve'}
              </button>
            )}
          </div>
        </div>
        {/* Channel breakdown */}
        {a.deliveryStats && Object.keys(a.deliveryStats).length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-3">
            {Object.entries(a.deliveryStats).map(([channel, stats]) => (
              <div key={channel} className="text-xs bg-slate-50 rounded-lg px-3 py-1.5">
                <span className="font-semibold text-slate-700">{channel}</span>
                <span className="text-slate-400 ml-1">
                  {stats.sent + stats.delivered} sent
                  {stats.failed > 0 && <span className="text-red-500 ml-1">{stats.failed} failed</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Acknowledgment tracking */}
        {renderAckSection(a)}
      </div>
    )
  }

  const formAccentColor = isDrill ? '#3B82F6' : '#DC2626'
  const formBorderColor = isDrill ? 'border-blue-200' : 'border-red-200'
  const formBgColor = isDrill ? 'bg-blue-50' : 'bg-red-50'
  const formTextColor = isDrill ? 'text-blue-900' : 'text-red-900'
  const formRingColor = isDrill ? 'focus:ring-blue-500' : 'focus:ring-red-500'

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-red-600" />
          Emergency Alerts
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Send urgent notifications to parents via push, SMS, WhatsApp, and email.
        </p>
      </div>

      {/* Alert Creation Form */}
      <div className={`bg-white rounded-xl border ${formBorderColor} shadow-sm overflow-hidden`}>
        <div className={`${formBgColor} border-b ${formBorderColor} px-6 py-4`}>
          <h2 className={`text-lg font-semibold ${formTextColor} flex items-center gap-2`}>
            <Send className="h-5 w-5" />
            {isDrill ? 'Send Drill Alert' : 'Send Emergency Alert'}
          </h2>
        </div>
        <div className="p-6 space-y-5">
          {/* Quick Templates */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Quick Start — select a scenario</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {ALERT_TEMPLATES.map((tpl) => {
                const Icon = tpl.icon
                const isActive = title === tpl.title
                return (
                  <button
                    key={tpl.label}
                    onClick={() => {
                      setTitle(tpl.title)
                      setMessage(tpl.message)
                      setType(tpl.type)
                      setSeverity(tpl.severity)
                    }}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all"
                    style={{
                      borderColor: isActive ? tpl.color : 'transparent',
                      backgroundColor: isActive ? tpl.color + '10' : '#f8f7f5',
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: tpl.color + '18' }}
                    >
                      <Icon className="w-4.5 h-4.5" style={{ color: tpl.color, width: '18px', height: '18px' }} />
                    </div>
                    <span className="text-xs font-semibold leading-tight" style={{ color: isActive ? tpl.color : '#4A3A40' }}>
                      {tpl.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. School Early Dismissal - Severe Weather"
              className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${formRingColor} focus:border-transparent`}
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Provide clear instructions for parents..."
              rows={3}
              className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${formRingColor} focus:border-transparent`}
            />
          </div>

          {/* Type & Severity row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Type selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Alert Type</label>
              <div className="flex flex-wrap gap-2">
                {ALERT_TYPES.map(at => {
                  const Icon = at.icon
                  const selected = type === at.value
                  return (
                    <button
                      key={at.value}
                      onClick={() => setType(at.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selected
                          ? isDrill ? 'bg-blue-600 text-white border-blue-600' : 'bg-red-600 text-white border-red-600'
                          : isDrill ? 'bg-white text-slate-600 border-slate-300 hover:border-blue-300' : 'bg-white text-slate-600 border-slate-300 hover:border-red-300'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {at.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Severity selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Severity</label>
              <div className="flex gap-2">
                {SEVERITY_OPTIONS.map(sev => {
                  const selected = severity === sev.value
                  return (
                    <button
                      key={sev.value}
                      onClick={() => setSeverity(sev.value)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                        selected
                          ? 'text-white'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                      style={selected ? { backgroundColor: sev.color, borderColor: sev.color } : undefined}
                    >
                      {sev.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Target */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Target Audience</label>
            <div className="relative">
              <select
                value={targetClass}
                onChange={e => setTargetClass(e.target.value)}
                className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${formRingColor} focus:border-transparent appearance-none pr-8`}
              >
                <option value="">Whole School</option>
                {(classes || []).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Channels */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Delivery Channels</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sendPush} onChange={e => setSendPush(e.target.checked)} className="rounded border-slate-300 text-red-600 focus:ring-red-500" />
                <span className="font-medium text-slate-700">Push Notification</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} className="rounded border-slate-300 text-red-600 focus:ring-red-500" />
                <span className="font-medium text-slate-700">SMS</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sendWhatsapp} onChange={e => setSendWhatsapp(e.target.checked)} className="rounded border-slate-300 text-red-600 focus:ring-red-500" />
                <span className="font-medium text-slate-700">WhatsApp</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="rounded border-slate-300 text-red-600 focus:ring-red-500" />
                <span className="font-medium text-slate-700">Email</span>
              </label>
            </div>
          </div>

          {/* Drill Mode & Acknowledgment */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isDrill}
                  onChange={e => setIsDrill(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 rounded-full peer-checked:bg-blue-500 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
              </div>
              <div>
                <span className="text-sm font-semibold text-blue-800">This is a drill</span>
                <p className="text-xs text-blue-600">Drill alerts are clearly marked and do not trigger emergency protocols</p>
              </div>
            </label>

            {isDrill && (
              <div className="ml-13 pl-0.5">
                <label className="block text-sm font-medium text-blue-800 mb-1">Drill Name</label>
                <input
                  type="text"
                  value={drillName}
                  onChange={e => setDrillName(e.target.value)}
                  placeholder="e.g. Fire Evacuation Drill - Term 1"
                  className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={requireAck}
                  onChange={e => setRequireAck(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 rounded-full peer-checked:bg-blue-500 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
              </div>
              <div>
                <span className="text-sm font-semibold text-blue-800">Require parent acknowledgment</span>
                <p className="text-xs text-blue-600">Parents will be asked to confirm they have read the alert</p>
              </div>
            </label>
          </div>

          {/* Send Button */}
          <div className="pt-2">
            <button
              onClick={() => {
                if (!title.trim() || !message.trim()) {
                  toast.error('Title and message are required')
                  return
                }
                setShowConfirm(true)
              }}
              disabled={isSubmitting || !title.trim() || !message.trim()}
              className="w-full md:w-auto px-8 py-3 rounded-xl text-white font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: formAccentColor }}
            >
              <AlertTriangle className="h-5 w-5" />
              {isSubmitting ? 'Sending...' : isDrill ? 'Send Drill Alert' : 'Send Emergency Alert'}
            </button>
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            Active Alerts
          </h2>
          <div className="space-y-3">
            {activeAlerts.map(a => renderAlertCard(a, true))}
          </div>
        </div>
      )}

      {/* Alert History */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Alert History</h2>
        {resolvedAlerts.length === 0 && activeAlerts.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
            No emergency alerts have been sent yet.
          </div>
        ) : (
          <div className="space-y-3">
            {resolvedAlerts.map(a => renderAlertCard(a, false))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <ConfirmModal
          title={isDrill ? 'Send Drill Alert?' : 'Send Emergency Alert?'}
          message={`This will immediately notify all ${targetClass || 'school'} parents via ${[
            sendPush && 'push notification',
            sendSms && 'SMS',
            sendWhatsapp && 'WhatsApp',
            sendEmail && 'email',
          ].filter(Boolean).join(', ')}.${isDrill ? ' This alert will be marked as a DRILL.' : ' This action cannot be undone.'}${requireAck ? ' Parents will be required to acknowledge.' : ''}`}
          confirmLabel={isDrill ? 'Send Drill Alert' : 'Send Alert Now'}
          onConfirm={handleSend}
          onCancel={() => setShowConfirm(false)}
          isLoading={isSubmitting}
          variant={isDrill ? 'warning' : 'danger'}
        />
      )}

      {/* Acknowledgment Modal */}
      {ackModalAlertId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Acknowledgment Tracking</h3>
                <p className="text-sm text-slate-500 mt-0.5">{ackModalAlertTitle}</p>
              </div>
              <button
                onClick={closeAckModal}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {ackLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
                </div>
              ) : ackData ? (
                <div className="space-y-5">
                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-slate-700">
                        {ackData.acknowledged}/{ackData.totalParents} ({ackData.totalParents > 0 ? Math.round((ackData.acknowledged / ackData.totalParents) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3">
                      <div
                        className="h-3 rounded-full transition-all"
                        style={{
                          width: `${ackData.totalParents > 0 ? Math.round((ackData.acknowledged / ackData.totalParents) * 100) : 0}%`,
                          backgroundColor: ackData.acknowledged === ackData.totalParents ? '#16A34A' : '#3B82F6',
                        }}
                      />
                    </div>
                  </div>

                  {/* Acknowledged list */}
                  {ackData.acknowledgments.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-2">Acknowledged</h4>
                      <div className="space-y-1.5">
                        {ackData.acknowledgments.map((entry, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm bg-green-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                              <span className="font-medium text-slate-800 truncate">{entry.parentName}</span>
                              <span className="text-slate-400 hidden sm:inline">|</span>
                              <span className="text-slate-500 text-xs truncate hidden sm:inline">{entry.parentEmail}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 text-xs text-slate-500">
                              <span>{formatTime(entry.acknowledgedAt)}</span>
                              <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase">{entry.device || 'unknown'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending count */}
                  {ackData.totalParents - ackData.acknowledged > 0 && (
                    <div className="bg-amber-50 rounded-lg px-4 py-3 border border-amber-200">
                      <p className="text-sm font-medium text-amber-800">
                        Pending: {ackData.totalParents - ackData.acknowledged} parent{ackData.totalParents - ackData.acknowledged !== 1 ? 's have' : ' has'} not yet acknowledged
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-slate-400 py-8">No data available</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
