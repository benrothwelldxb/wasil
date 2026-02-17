import React, { useState, useEffect } from 'react'
import { Plus, X, Pencil, Trash2, Play, Square, ClipboardList, Activity, ChevronDown, ChevronUp, MessageSquare, Download } from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal } from '@wasil/shared'
import type { PulseSurvey, PulseSurveyStatus, PulseAnalytics, PulseOptionalQuestion } from '@wasil/shared'

interface PulseForm {
  halfTermName: string
  opensAt: string
  closesAt: string
  additionalQuestionKey: string
}

const emptyForm: PulseForm = {
  halfTermName: '',
  opensAt: '',
  closesAt: '',
  additionalQuestionKey: '',
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

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PulseForm>(emptyForm)
  const [editingSurvey, setEditingSurvey] = useState<PulseSurvey | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PulseSurvey | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      if (editingSurvey) {
        await api.pulse.update(editingSurvey.id, {
          halfTermName: form.halfTermName,
          opensAt: form.opensAt,
          closesAt: form.closesAt,
          additionalQuestionKey: form.additionalQuestionKey || null,
        })
      } else {
        await api.pulse.create({
          halfTermName: form.halfTermName,
          opensAt: form.opensAt,
          closesAt: form.closesAt,
          additionalQuestionKey: form.additionalQuestionKey || null,
        })
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
      <div className="flex items-center justify-between mb-6">
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

            {/* Optional Question Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Optional Additional Question
              </label>
              <select
                value={form.additionalQuestionKey}
                onChange={(e) => setForm((f) => ({ ...f, additionalQuestionKey: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">None - Use 7 core questions only</option>
                {(optionalQuestions || []).map((q) => (
                  <option key={q.key} value={q.key}>
                    {q.text}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Add one optional question to the standard 7 core questions
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
