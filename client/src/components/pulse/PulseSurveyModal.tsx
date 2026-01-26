import React, { useState } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { useMutation } from '../../hooks/useApi'
import * as api from '../../services/api'
import type { PulseSurvey } from '../../types'

interface PulseSurveyModalProps {
  pulse: PulseSurvey
  onClose: () => void
  onComplete: () => void
}

export function PulseSurveyModal({ pulse, onClose, onComplete }: PulseSurveyModalProps) {
  const theme = useTheme()
  const [answers, setAnswers] = useState<Record<string, number | string>>({})
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [showThankYou, setShowThankYou] = useState(false)
  const { mutate: submitResponse, isLoading } = useMutation(api.pulse.respond)

  const questions = pulse.questions || []
  const question = questions[currentQuestion]

  const handleAnswer = (value: number | string) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }))
  }

  const handleNext = async () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1)
    } else {
      // Submit
      await submitResponse(pulse.id, answers)
      setShowThankYou(true)
    }
  }

  const handleDone = () => {
    onComplete()
  }

  const isLikert = question?.type === 'LIKERT_5'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full">
        <div className="p-6">
          {showThankYou ? (
            // Thank You Screen
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-green-700 mb-2">
                Thank You!
              </h3>
              <p className="text-gray-600 mb-6">
                Your feedback has been submitted successfully. We appreciate you taking the time to help us improve.
              </p>
              <button
                onClick={handleDone}
                className="px-8 py-3 rounded-lg text-white font-medium"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                Done
              </button>
            </div>
          ) : (
            // Survey Questions
            <>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold" style={{ color: theme.colors.brandColor }}>
                  Parent Pulse - {pulse.halfTermName}
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
                  &times;
                </button>
              </div>

              {/* Progress */}
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-500 mb-2">
                  <span>Question {currentQuestion + 1} of {questions.length}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${((currentQuestion + 1) / questions.length) * 100}%`,
                      backgroundColor: theme.colors.brandColor,
                    }}
                  />
                </div>
              </div>

              {/* Question */}
              <p className="text-gray-800 mb-6">{question?.text}</p>

              {/* Answer Options */}
              {isLikert ? (
                <div className="flex justify-between mb-2">
                  {[1, 2, 3, 4, 5].map((value) => {
                    // Red to green gradient colors
                    const likertColors: Record<number, { bg: string; border: string }> = {
                      1: { bg: '#ef4444', border: '#dc2626' }, // Red
                      2: { bg: '#f97316', border: '#ea580c' }, // Orange
                      3: { bg: '#eab308', border: '#ca8a04' }, // Yellow
                      4: { bg: '#84cc16', border: '#65a30d' }, // Lime
                      5: { bg: '#22c55e', border: '#16a34a' }, // Green
                    }
                    const color = likertColors[value]
                    const isSelected = answers[question.id] === value

                    return (
                      <button
                        key={value}
                        onClick={() => handleAnswer(value)}
                        className={`w-12 h-12 rounded-full border-2 font-medium transition-all ${
                          isSelected
                            ? 'text-white scale-110 shadow-lg'
                            : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:scale-105'
                        }`}
                        style={
                          isSelected
                            ? { backgroundColor: color.bg, borderColor: color.border }
                            : undefined
                        }
                      >
                        {value}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <textarea
                  value={(answers[question?.id] as string) || ''}
                  onChange={(e) => handleAnswer(e.target.value)}
                  placeholder="Your feedback (optional)"
                  className="w-full p-3 border border-gray-300 rounded-lg mb-2 h-32"
                />
              )}

              {isLikert && (
                <div className="flex justify-between text-xs text-gray-500 mb-6">
                  <span>Strongly Disagree</span>
                  <span>Strongly Agree</span>
                </div>
              )}

              {/* Navigation */}
              <button
                onClick={handleNext}
                disabled={isLikert && !answers[question?.id]}
                className="w-full py-3 rounded-lg text-white font-medium disabled:opacity-50 mt-4"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {currentQuestion < questions.length - 1 ? 'Next' : isLoading ? 'Submitting...' : 'Submit'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
