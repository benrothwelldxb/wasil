import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { PulseSurvey } from '@wasil/shared'
import { X, Check } from 'lucide-react'

interface PulseSurveyModalProps {
  pulse: PulseSurvey
  onClose: () => void
  onComplete: () => void
}

export function PulseSurveyModal({ pulse, onClose, onComplete }: PulseSurveyModalProps) {
  const { t } = useTranslation()
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
      await submitResponse(pulse.id, answers)
      setShowThankYou(true)
    }
  }

  const isLikert = question?.type === 'LIKERT_5'

  // Emoji faces for Likert scale — self-explanatory without labels
  const likertEmojis = ['\u{1F641}', '\u{1F615}', '\u{1F610}', '\u{1F642}', '\u{1F929}']

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md"
        style={{ borderRadius: '22px 22px 0 0' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E8DDE0' }} />
        </div>

        <div className="px-5 pb-8">
          {showThankYou ? (
            <div className="text-center py-10">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ backgroundColor: '#EDFAF2' }}
              >
                <Check style={{ width: '32px', height: '32px', color: '#5BA97B' }} />
              </div>
              <h3 className="text-[22px] font-extrabold mb-2" style={{ color: '#5BA97B' }}>
                {t('pulse.thankYou', 'Thank you!')}
              </h3>
              <p className="text-sm font-medium mb-8" style={{ color: '#7A6469' }}>
                {t('pulse.feedbackSubmitted', 'Your feedback helps us improve')}
              </p>
              <button
                onClick={onComplete}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '14px',
                  backgroundColor: '#C4506E',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {t('common.done', 'Done')}
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[18px] font-extrabold" style={{ color: '#2D2225' }}>
                  Parent Pulse
                </h3>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-xl"
                  style={{ color: '#A8929A' }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Progress */}
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-bold" style={{ color: '#A8929A' }}>
                    {t('pulse.question', {
                      current: currentQuestion + 1,
                      total: questions.length,
                      defaultValue: `Question ${currentQuestion + 1} of ${questions.length}`,
                    })}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: '#F0E4E6' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${((currentQuestion + 1) / questions.length) * 100}%`,
                      backgroundColor: '#C4506E',
                    }}
                  />
                </div>
              </div>

              {/* Question */}
              <p className="text-[16px] font-bold leading-snug mb-6" style={{ color: '#2D2225' }}>
                {question?.text}
              </p>

              {/* Likert Scale */}
              {isLikert ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold" style={{ color: '#D8CDD0', width: '32px', textAlign: 'center' }}>
                      Poor
                    </span>
                    <div className="flex gap-2 flex-1 justify-center">
                      {[1, 2, 3, 4, 5].map((value, idx) => {
                        const isSelected = answers[question.id] === value
                        return (
                          <button
                            key={value}
                            onClick={() => handleAnswer(value)}
                            style={{
                              width: '52px',
                              height: '52px',
                              borderRadius: '50%',
                              fontSize: '24px',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: isSelected ? 'rgba(196,80,110,0.12)' : '#FFF8F4',
                              transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                              transition: 'all 0.2s',
                              boxShadow: isSelected ? '0 2px 8px rgba(196,80,110,0.15)' : 'none',
                            }}
                          >
                            {likertEmojis[idx]}
                          </button>
                        )
                      })}
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: '#D8CDD0', width: '32px', textAlign: 'center' }}>
                      Great
                    </span>
                  </div>
                </div>
              ) : (
                <textarea
                  value={(answers[question?.id] as string) || ''}
                  onChange={(e) => handleAnswer(e.target.value)}
                  placeholder={t('pulse.yourFeedback', 'Share your thoughts...')}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '14px',
                    border: '1.5px solid #F0E4E6',
                    fontSize: '15px',
                    fontWeight: 500,
                    color: '#2D2225',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              )}

              {/* Next / Submit */}
              <button
                onClick={handleNext}
                disabled={(isLikert && !answers[question?.id]) || isLoading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '14px',
                  backgroundColor: '#C4506E',
                  color: '#FFFFFF',
                  fontSize: '15px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '20px',
                  opacity: (isLikert && !answers[question?.id]) || isLoading ? 0.5 : 1,
                }}
              >
                {currentQuestion < questions.length - 1
                  ? t('common.next', 'Next')
                  : isLoading
                    ? t('pulse.submitting', 'Submitting...')
                    : t('common.submit', 'Submit')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
