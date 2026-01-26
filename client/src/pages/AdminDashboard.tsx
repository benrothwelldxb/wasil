import React, { useState } from 'react'
import { Send, BarChart3, Users, Plus, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useApi, useMutation } from '../hooks/useApi'
import { MessageForm, SurveyForm } from '../components/forms'
import type { MessageFormData, SurveyFormData } from '../components/forms'
import * as api from '../services/api'
import type { Message, Survey, Class } from '../types'

export function AdminDashboard() {
  const { user } = useAuth()
  const theme = useTheme()

  const [activeTab, setActiveTab] = useState<'messages' | 'surveys' | 'analytics'>('messages')
  const [showMessageForm, setShowMessageForm] = useState(false)
  const [showSurveyForm, setShowSurveyForm] = useState(false)

  // Fetch data
  const { data: messages, refetch: refetchMessages } = useApi<Message[]>(
    () => api.messages.listAll(),
    []
  )
  const { data: surveys, refetch: refetchSurveys } = useApi<(Survey & { responses: Array<{ response: string }> })[]>(
    () => api.surveys.listAll(),
    []
  )
  const { data: classes } = useApi<Class[]>(
    () => api.classes.list(),
    []
  )

  // Mutations
  const { mutate: createMessage, isLoading: creatingMessage } = useMutation(api.messages.create)
  const { mutate: createSurvey, isLoading: creatingSurvey } = useMutation(api.surveys.create)

  // Message form state
  const [messageForm, setMessageForm] = useState<MessageFormData>({
    title: '',
    content: '',
    targetClass: 'Whole School',
    hasAction: false,
    actionType: 'consent',
    actionLabel: '',
    actionDueDate: '',
    actionAmount: '',
  })

  // Survey form state
  const [surveyForm, setSurveyForm] = useState<SurveyFormData>({
    question: '',
    options: ['', ''],
    targetClass: 'Whole School',
  })

  const handleCreateMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    await createMessage({
      title: messageForm.title,
      content: messageForm.content,
      targetClass: messageForm.targetClass,
      ...(messageForm.hasAction && {
        actionType: messageForm.actionType,
        actionLabel: messageForm.actionLabel,
        actionDueDate: messageForm.actionDueDate,
        actionAmount: messageForm.actionAmount,
      }),
    })
    setMessageForm({
      title: '',
      content: '',
      targetClass: 'Whole School',
      hasAction: false,
      actionType: 'consent',
      actionLabel: '',
      actionDueDate: '',
      actionAmount: '',
    })
    setShowMessageForm(false)
    refetchMessages()
  }

  const handleCreateSurvey = async (e: React.FormEvent) => {
    e.preventDefault()
    await createSurvey({
      question: surveyForm.question,
      options: surveyForm.options.filter(Boolean),
      targetClass: surveyForm.targetClass,
    })
    setSurveyForm({ question: '', options: ['', ''], targetClass: 'Whole School' })
    setShowSurveyForm(false)
    refetchSurveys()
  }

  const targetClassOptions = ['Whole School', ...(classes?.map((c) => c.name) || [])]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-bold" style={{ color: theme.colors.brandColor }}>
          Admin Dashboard
        </h2>
        <p className="text-gray-600 mt-1">
          Welcome back, {user?.name}. Manage school communications.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: theme.colors.brandColorLight }}
            >
              <Send className="h-6 w-6" style={{ color: theme.colors.brandColor }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{messages?.length || 0}</p>
              <p className="text-sm text-gray-500">Messages Sent</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: `${theme.colors.accentColor}40` }}
            >
              <BarChart3 className="h-6 w-6" style={{ color: theme.colors.brandColor }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{surveys?.length || 0}</p>
              <p className="text-sm text-gray-500">Active Surveys</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-lg bg-green-100">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{classes?.length || 0}</p>
              <p className="text-sm text-gray-500">Classes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-4 px-4" aria-label="Tabs">
            {(['messages', 'surveys', 'analytics'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-2 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-burgundy text-burgundy'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                style={activeTab === tab ? { borderColor: theme.colors.brandColor, color: theme.colors.brandColor } : undefined}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'messages' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Messages</h3>
                <button
                  onClick={() => setShowMessageForm(!showMessageForm)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showMessageForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showMessageForm ? 'Cancel' : 'New Message'}</span>
                </button>
              </div>

              {showMessageForm && (
                <MessageForm
                  formData={messageForm}
                  onChange={setMessageForm}
                  onSubmit={handleCreateMessage}
                  targetClassOptions={targetClassOptions}
                  isSubmitting={creatingMessage}
                />
              )}

              <div className="space-y-4">
                {messages?.map((message) => (
                  <div key={message.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs px-2 py-1 rounded-full bg-burgundy text-white" style={{ backgroundColor: theme.colors.brandColor }}>
                          {message.targetClass}
                        </span>
                        <h4 className="font-medium mt-2">{message.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">{message.content}</p>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(message.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'surveys' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Surveys</h3>
                <button
                  onClick={() => setShowSurveyForm(!showSurveyForm)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {showSurveyForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{showSurveyForm ? 'Cancel' : 'New Survey'}</span>
                </button>
              </div>

              {showSurveyForm && (
                <SurveyForm
                  formData={surveyForm}
                  onChange={setSurveyForm}
                  onSubmit={handleCreateSurvey}
                  targetClassOptions={targetClassOptions}
                  isSubmitting={creatingSurvey}
                />
              )}

              <div className="space-y-4">
                {surveys?.map((survey) => (
                  <div key={survey.id} className="bg-gray-50 rounded-lg p-4">
                    <span className="text-xs px-2 py-1 rounded-full bg-burgundy text-white" style={{ backgroundColor: theme.colors.brandColor }}>
                      {survey.targetClass}
                    </span>
                    <h4 className="font-medium mt-2">{survey.question}</h4>
                    <div className="mt-2 space-y-1">
                      {survey.options.map((option: string) => {
                        const count = survey.responses?.filter((r: { response: string }) => r.response === option).length || 0
                        const total = survey.responses?.length || 0
                        const percentage = total > 0 ? Math.round((count / total) * 100) : 0
                        return (
                          <div key={option} className="text-sm">
                            <div className="flex justify-between">
                              <span>{option}</span>
                              <span className="text-gray-500">{count} ({percentage}%)</span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full mt-1">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${percentage}%`, backgroundColor: theme.colors.brandColor }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Analytics dashboard coming soon</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
