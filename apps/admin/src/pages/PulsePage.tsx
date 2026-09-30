import React, { useState, useEffect } from 'react'
import { Plus, X, Pencil, Trash2, Play, Square, ClipboardList, Activity, ChevronDown, ChevronUp, MessageSquare, Download } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { PulseSurvey, PulseSurveyStatus, PulseAnalytics, PulseOptionalQuestion, PulseCustomQuestion, PulseComparison, PulseTemplate } from '@wasil/shared'

/**
 * The seven core questions, by STABLE KEY.
 *
 * Mirrored from the server rather than fetched, because this list is only a
 * set of tick-boxes — the server decides what a survey actually asks, and a
 * key this page does not recognise is simply not offered rather than silently
 * dropped. The wording here is a label; the wording parents see comes from the
 * server, so a revision there does not need a matching edit here.
 */
const CORE_QUESTIONS: { key: string; label: string }[] = [
  { key: 'core_quality', label: 'Confident the school provides a high-quality education' },
  { key: 'core_belonging', label: 'My child feels happy, safe and a sense of belonging' },
  { key: 'core_communication', label: 'The school communicates clearly and in good time' },
  { key: 'core_responsiveness', label: 'I know who to contact and feel listened to' },
  { key: 'core_expectations', label: 'Expectations for behaviour and learning are clear' },
  { key: 'core_overall_satisfaction', label: 'Overall satisfaction with our experience' },
  { key: 'core_improve_now', label: 'One thing the school could do to improve (free text)' },
]
const ALL_CORE_KEYS = CORE_QUESTIONS.map(q => q.key)

interface PulseForm {
  halfTermName: string
  opensAt: string
  closesAt: string
  additionalQuestionKey: string
  customQuestions: PulseCustomQuestion[]
  coreQuestionKeys: string[]
  audienceType: 'SCHOOL' | 'GROUP' | 'YEAR_GROUPS'
  audienceGroupId: string
  audienceYearGroupIds: string[]
}

const emptyForm: PulseForm = {
  halfTermName: '',
  opensAt: '',
  closesAt: '',
  additionalQuestionKey: '',
  customQuestions: [],
  // A new survey starts as the full termly pulse to everybody — the thing it
  // has always been. Narrowing is a decision somebody makes; it should not be
  // the state you land in by not noticing a control.
  coreQuestionKeys: ALL_CORE_KEYS,
  audienceType: 'SCHOOL',
  audienceGroupId: '',
  audienceYearGroupIds: [],
}

const statusBadge: Record<PulseSurveyStatus, { bg: string; text: string; label: string }> = {
  DRAFT: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'DRAFT' },
  OPEN: { bg: 'bg-green-100', text: 'text-green-700', label: 'OPEN' },
  CLOSED: { bg: 'bg-red-100', text: 'text-red-700', label: 'CLOSED' },
}

// Analytics bar component for Likert questions
function LikertBar({ average, distribution }: { average?: number; distribution?: Record<number, number> }) {
  if (average === undefined || !distribution) return <span className="text-slate-400">No responses</span>

  const total = Object.values(distribution).reduce((a, b) => a + b, 0)
  if (total === 0) return <span className="text-slate-400">No responses</span>

  const percentage = (average / 5) * 100

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-slate-700 w-12">{average.toFixed(1)}/5</span>
      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${percentage}%`,
            backgroundColor: average >= 4 ? '#22c55e' : average >= 3 ? '#eab308' : '#ef4444',
          }}
        />
      </div>
      <span className="text-xs text-slate-400 w-20 text-right">{total} response{total !== 1 ? 's' : ''}</span>
    </div>
  )
}

// Analytics panel component
function AnalyticsPanel({ surveyId, halfTermName, questions }: { surveyId: string; halfTermName: string; questions: PulseSurvey['questions'] }) {
  const [analytics, setAnalytics] = useState<PulseAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTextResponses, setShowTextResponses] = useState(false)

  useEffect(() => {
    api.pulse.analytics(surveyId)
      .then(setAnalytics)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [surveyId])

  if (loading) {
    return <div className="py-4 text-center text-slate-400">Loading analytics...</div>
  }

  if (!analytics) {
    return <div className="py-4 text-center text-slate-400">Failed to load analytics</div>
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
      {/* Response Rate & Export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700">Response Rate:</span>
          <span className="text-slate-600">
            {analytics.responseCount}/{analytics.totalParents} ({analytics.responseRate}%)
          </span>
        </div>
        {analytics.responseCount > 0 && (
          <button
            onClick={() => api.pulse.exportCSV(surveyId, halfTermName)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Question Stats */}
      <div className="space-y-3">
        {questions.map((q, index) => {
          const stat = analytics.questionStats[q.id]
          if (!stat) return null

          return (
            <div key={q.id} className="space-y-1">
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-slate-500 w-5 pt-0.5">{index + 1}.</span>
                <div className="flex-1">
                  <p className="text-sm text-slate-600 mb-1.5 line-clamp-2">{q.text}</p>
                  {q.type === 'LIKERT_5' ? (
                    <LikertBar average={stat.average} distribution={stat.distribution as Record<number, number>} />
                  ) : (
                    <div>
                      <button
                        onClick={() => setShowTextResponses(!showTextResponses)}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {stat.responses?.length || 0} response{(stat.responses?.length || 0) !== 1 ? 's' : ''}
                        {showTextResponses ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {showTextResponses && stat.responses && stat.responses.length > 0 && (
                        <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                          {stat.responses.map((text, i) => (
                            <div key={i} className="p-2 bg-slate-50 rounded text-sm text-slate-600 italic">
                              "{text}"
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Survey card with expandable analytics
function SurveyCard({
  survey,
  optionalQuestions,
  onEdit,
  onDelete,
  onSend,
  onClose,
}: {
  survey: PulseSurvey
  optionalQuestions: PulseOptionalQuestion[]
  onEdit: () => void
  onDelete: () => void
  onSend: () => void
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const badge = statusBadge[survey.status]

  // Find optional question text
  const optionalQ = survey.additionalQuestionKey
    ? optionalQuestions.find(q => q.key === survey.additionalQuestionKey)
    : null

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-slate-900">{survey.halfTermName}</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
            <span>Opens: {new Date(survey.opensAt).toLocaleDateString()}</span>
            <span>Closes: {new Date(survey.closesAt).toLocaleDateString()}</span>
            {survey.responseCount !== undefined && (
              <span className="flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5" />
                {survey.responseCount} response{survey.responseCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {survey.status === 'DRAFT' && optionalQ && (
            <div className="mt-2 text-sm text-slate-500">
              <span className="text-slate-400">Optional Q:</span> {optionalQ.text.substring(0, 50)}...
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 ml-4">
          {survey.status === 'DRAFT' && (
            <button
              onClick={onSend}
              className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
              title="Send (Open)"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          {survey.status === 'OPEN' && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              title="Close"
            >
              <Square className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expand/Collapse Button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {expanded ? 'Hide' : 'View'} Questions & Analytics
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          {/* Questions List */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-slate-700 mb-2">Questions</h4>
            <div className="space-y-2">
              {survey.questions.map((q, index) => (
                <div key={q.id} className="flex items-start gap-2 text-sm">
                  <span className="text-slate-400 w-5">{index + 1}.</span>
                  <span className="flex-1 text-slate-600">{q.text}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    q.type === 'LIKERT_5' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                  }`}>
                    {q.type === 'LIKERT_5' ? '1-5 Scale' : 'Text'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Analytics (only for OPEN or CLOSED surveys) */}
          {(survey.status === 'OPEN' || survey.status === 'CLOSED') && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">Analytics</h4>
              <AnalyticsPanel surveyId={survey.id} halfTermName={survey.halfTermName} questions={survey.questions} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PulsePage() {
  const theme = useTheme()
  const { data: surveys, refetch } = useApi<PulseSurvey[]>(() => api.pulse.listAll(), [])
  const { data: optionalQuestions } = useApi<PulseOptionalQuestion[]>(() => api.pulse.optionalQuestions(), [])
  // For the audience picker. Both are small lists a school already maintains —
  // a pulse for "new parents" should use the group they already have rather
  // than a second one built for surveys.
  const { data: groups } = useApi<Array<{ id: string; name: string }>>(() => api.groups.list(), [])
  const { data: yearGroups } = useApi<Array<{ id: string; name: string }>>(() => api.yearGroups.list(), [])
  const { data: templates } = useApi<PulseTemplate[]>(() => api.pulse.templates(), [])

  /**
   * Fill the form from a ready-made survey.
   *
   * Everything it sets is then editable — a template that could not be changed
   * would be a form, not a starting point. The name and the dates are left
   * alone: those are the two things nobody would want guessed, and a survey
   * called "Start of the year" three terms running is how a comparison chart
   * becomes unreadable.
   *
   * The audience TYPE is applied but never the id. A template knows it is for
   * a group; it cannot know which, and defaulting to the first one is how a
   * new-families survey goes to the PTA.
   */
  const applyTemplate = (t: PulseTemplate) => {
    setForm(f => ({
      ...f,
      coreQuestionKeys: t.coreQuestionKeys,
      additionalQuestionKey: t.additionalQuestionKey || '',
      customQuestions: t.customQuestions.map((q, i) => ({
        id: `cq_${Date.now()}_${i}`,
        text: q.text,
        type: q.type,
      })),
      audienceType: t.audienceType,
      audienceGroupId: '',
      audienceYearGroupIds: [],
    }))
  }

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PulseForm>(emptyForm)
  const [editingSurvey, setEditingSurvey] = useState<PulseSurvey | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PulseSurvey | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const payload = {
        halfTermName: form.halfTermName,
        opensAt: form.opensAt,
        closesAt: form.closesAt,
        additionalQuestionKey: form.additionalQuestionKey || null,
        customQuestions: form.customQuestions.filter(q => q.text.trim()),
        coreQuestionKeys: form.coreQuestionKeys,
        audienceType: form.audienceType,
        audienceGroupId: form.audienceType === 'GROUP' ? form.audienceGroupId : null,
        audienceYearGroupIds: form.audienceType === 'YEAR_GROUPS' ? form.audienceYearGroupIds : [],
      }
      if (editingSurvey) {
        await api.pulse.update(editingSurvey.id, payload)
      } else {
        await api.pulse.create(payload)
      }
      setShowForm(false)
      setEditingSurvey(null)
      setForm(emptyForm)
      refetch()
    } catch (err) {
      console.error('Failed to save pulse survey:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (survey: PulseSurvey) => {
    setEditingSurvey(survey)
    setForm({
      halfTermName: survey.halfTermName,
      opensAt: survey.opensAt.split('T')[0],
      closesAt: survey.closesAt.split('T')[0],
      additionalQuestionKey: survey.additionalQuestionKey || '',
      customQuestions: (survey as any).customQuestions || [],
      // What this survey ACTUALLY is, not a fresh default. Opening the edit
      // form on the full set would quietly widen a scoped survey the first
      // time somebody fixed a typo in its name.
      coreQuestionKeys: (survey as any).coreQuestionKeys ?? ALL_CORE_KEYS,
      audienceType: ((survey as any).audienceType as PulseForm['audienceType']) || 'SCHOOL',
      audienceGroupId: (survey as any).audienceGroupId || '',
      audienceYearGroupIds: (survey as any).audienceYearGroupIds || [],
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingSurvey(null)
    setForm(emptyForm)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.pulse.delete(deleteTarget.id)
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      console.error('Failed to delete pulse survey:', err)
    }
  }

  const handleSend = async (survey: PulseSurvey) => {
    try {
      await api.pulse.send(survey.id)
      refetch()
    } catch (err) {
      console.error('Failed to send pulse survey:', err)
    }
  }

  const handleClose = async (survey: PulseSurvey) => {
    try {
      await api.pulse.close(survey.id)
      refetch()
    } catch (err) {
      console.error('Failed to close pulse survey:', err)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-slate-900">Parent Pulse</h2>
        <button
          onClick={() => { setShowForm(true); setEditingSurvey(null); setForm(emptyForm) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          <Plus className="w-4 h-4" />
          New Pulse Survey
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Send short, anonymous surveys each half-term to gauge parent satisfaction, identify concerns early, and track sentiment over time. Results are aggregated — individual responses are never shared.
      </p>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingSurvey ? 'Edit Pulse Survey' : 'New Pulse Survey'}
            </h3>
            <button onClick={handleCancel} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Half-Term Name</label>
              <input
                type="text"
                value={form.halfTermName}
                onChange={(e) => setForm((f) => ({ ...f, halfTermName: e.target.value }))}
                placeholder="e.g. Autumn 1, Spring 2"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Opens At</label>
                <input
                  type="date"
                  value={form.opensAt}
                  onChange={(e) => setForm((f) => ({ ...f, opensAt: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Closes At</label>
                <input
                  type="date"
                  value={form.closesAt}
                  onChange={(e) => setForm((f) => ({ ...f, closesAt: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            {/* START FROM A READY-MADE SURVEY.
                Choosing questions is the mechanism; this is the shortcut.
                Only offered when creating — applying one to a survey being
                edited would silently rewrite a question list somebody has
                already answered against. */}
            {!editingSurvey && (templates || []).length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Start from
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    optional — everything it fills in stays editable
                  </span>
                </label>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {(templates || []).map(t => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50"
                    >
                      <span className="block text-sm font-semibold text-slate-800">{t.name}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{t.blurb}</span>
                      <span className="block text-xs text-slate-400 mt-1">
                        {t.coreQuestionKeys.length + t.customQuestions.length + (t.additionalQuestionKey ? 1 : 0)}
                        {' questions'}
                        {t.audienceType === 'GROUP' && ' · you choose the group'}
                        {t.audienceType === 'YEAR_GROUPS' && ' · you choose the year groups'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* WHICH QUESTIONS.
                The core set used to be mandatory, so every pulse was eight
                questions whatever it was for — and the length is what stops
                people answering. Ticked by default: narrowing is a decision
                somebody makes, not a state you land in by not noticing a
                control. */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">Core questions</label>
                <span className="text-xs text-slate-400">
                  {form.coreQuestionKeys.length} of {CORE_QUESTIONS.length} · asking fewer gets more replies
                </span>
              </div>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {CORE_QUESTIONS.map(q => {
                  const on = form.coreQuestionKeys.includes(q.key)
                  return (
                    <label key={q.key} className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setForm(f => ({
                          ...f,
                          coreQuestionKeys: on
                            ? f.coreQuestionKeys.filter(k => k !== q.key)
                            : [...f.coreQuestionKeys, q.key],
                        }))}
                        className="h-4 w-4 mt-0.5"
                      />
                      <span className="text-sm text-slate-700">{q.label}</span>
                    </label>
                  )
                })}
              </div>
              <div className="flex gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, coreQuestionKeys: ALL_CORE_KEYS }))}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, coreQuestionKeys: [] }))}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Clear
                </button>
              </div>
              {form.coreQuestionKeys.length === 0 && form.customQuestions.filter(q => q.text.trim()).length === 0 && (
                <p className="text-xs text-red-600 mt-1.5">
                  This survey would ask nothing. Tick a core question or add one of your own.
                </p>
              )}
              {form.coreQuestionKeys.length > 0 && form.coreQuestionKeys.length < CORE_QUESTIONS.length && (
                <p className="text-xs text-slate-400 mt-1.5">
                  Questions you leave out simply are not asked this time — the ones you keep stay
                  comparable with previous surveys.
                </p>
              )}
            </div>

            {/* WHO IT GOES TO.
                A pulse used to go to every parent, always. That is right for a
                termly check and wrong for most reasons a school wants to ask
                something. The audience is also the DENOMINATOR — see the
                results view. */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Send to</label>
              <select
                value={form.audienceType}
                onChange={e => setForm(f => ({ ...f, audienceType: e.target.value as PulseForm['audienceType'] }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="SCHOOL">Everyone</option>
                <option value="GROUP">A group</option>
                <option value="YEAR_GROUPS">Year groups</option>
              </select>

              {form.audienceType === 'GROUP' && (
                <select
                  value={form.audienceGroupId}
                  onChange={e => setForm(f => ({ ...f, audienceGroupId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white mt-2"
                >
                  <option value="">Choose a group...</option>
                  {(groups || []).map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}

              {form.audienceType === 'YEAR_GROUPS' && (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 mt-2">
                  {(yearGroups || []).map(yg => {
                    const on = form.audienceYearGroupIds.includes(yg.id)
                    return (
                      <label key={yg.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setForm(f => ({
                            ...f,
                            audienceYearGroupIds: on
                              ? f.audienceYearGroupIds.filter(i => i !== yg.id)
                              : [...f.audienceYearGroupIds, yg.id],
                          }))}
                          className="h-4 w-4"
                        />
                        <span className="text-sm text-slate-700">{yg.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              <p className="text-xs text-slate-400 mt-1.5">
                Only these families see it, and the response rate is measured against them — so a
                scoped survey is not made to look like a failure by the size of the school.
              </p>
            </div>

            {/* Optional Question from presets */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Preset Additional Question
              </label>
              <select
                value={form.additionalQuestionKey}
                onChange={(e) => setForm((f) => ({ ...f, additionalQuestionKey: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">None</option>
                {(optionalQuestions || []).map((q) => (
                  <option key={q.key} value={q.key}>
                    {q.text}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Pick from common school survey questions
              </p>
            </div>

            {/* Custom Questions */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Custom Questions
              </label>
              <div className="space-y-2">
                {form.customQuestions.map((cq, idx) => (
                  <div key={cq.id} className="flex items-start gap-2">
                    <input
                      type="text"
                      value={cq.text}
                      onChange={(e) => {
                        const updated = [...form.customQuestions]
                        updated[idx] = { ...updated[idx], text: e.target.value }
                        setForm(f => ({ ...f, customQuestions: updated }))
                      }}
                      placeholder="Enter your question..."
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={cq.type}
                      onChange={(e) => {
                        const updated = [...form.customQuestions]
                        updated[idx] = { ...updated[idx], type: e.target.value as 'LIKERT_5' | 'TEXT_OPTIONAL' }
                        setForm(f => ({ ...f, customQuestions: updated }))
                      }}
                      className="px-2 py-2 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="LIKERT_5">Rating (1-5)</option>
                      <option value="TEXT_OPTIONAL">Free Text</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setForm(f => ({ ...f, customQuestions: f.customQuestions.filter((_, i) => i !== idx) }))
                      }}
                      className="p-2 text-slate-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setForm(f => ({
                      ...f,
                      customQuestions: [...f.customQuestions, { id: `cq_${Date.now()}`, text: '', type: 'LIKERT_5' }],
                    }))
                  }}
                  className="flex items-center gap-1 text-sm hover:underline"
                  style={{ color: theme.colors.brandColor }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add custom question
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Add your own questions alongside the 7 core questions
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {isSubmitting ? 'Saving...' : editingSurvey ? 'Update Survey' : 'Create Survey'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Survey List */}
      <div className="space-y-3">
        {(surveys || []).map((survey) => (
          <SurveyCard
            key={survey.id}
            survey={survey}
            optionalQuestions={optionalQuestions || []}
            onEdit={() => handleEdit(survey)}
            onDelete={() => setDeleteTarget(survey)}
            onSend={() => handleSend(survey)}
            onClose={() => handleClose(survey)}
          />
        ))}
        {surveys && surveys.length === 0 && (
          <p className="text-center text-slate-400 py-8">No pulse surveys yet.</p>
        )}
      </div>

      {/* Term Comparison */}
      <PulseComparisonSection />

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Pulse Survey"
          message={`Are you sure you want to delete "${deleteTarget.halfTermName}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// Core question labels for comparison table
const CORE_LABELS: Record<string, string> = {
  core_quality: 'Education Quality',
  core_belonging: 'Belonging & Safety',
  core_communication: 'Communication',
  core_responsiveness: 'Responsiveness',
  core_expectations: 'Expectations',
  core_overall_satisfaction: 'Overall Satisfaction',
}

function PulseComparisonSection() {
  const { data, isLoading } = useApi<{ comparison: PulseComparison[] }>(
    () => api.pulse.comparison(),
    []
  )

  if (isLoading || !data || data.comparison.length < 2) return null

  const surveys = data.comparison
  const coreKeys = Object.keys(CORE_LABELS)

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Term-over-Term Comparison</h3>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Question</th>
                {surveys.map(s => (
                  <th key={s.id} className="text-center px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">
                    {s.halfTermName}
                    <div className="text-xs font-normal text-slate-400">{s.responseCount} responses</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coreKeys.map(key => (
                <tr key={key} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 text-slate-700">{CORE_LABELS[key]}</td>
                  {surveys.map((s, sIdx) => {
                    const val = s.coreAverages[key]
                    const prev = sIdx > 0 ? surveys[sIdx - 1].coreAverages[key] : null
                    const diff = val != null && prev != null ? val - prev : null

                    return (
                      <td key={s.id} className="text-center px-4 py-2.5">
                        {val != null ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span
                              className="font-bold"
                              style={{ color: val >= 4 ? '#2D8B4E' : val >= 3 ? '#8B5E0F' : '#D14D4D' }}
                            >
                              {val.toFixed(1)}
                            </span>
                            {diff != null && diff !== 0 && (
                              <span
                                className="text-xs font-semibold"
                                style={{ color: diff > 0 ? '#2D8B4E' : '#D14D4D' }}
                              >
                                {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
