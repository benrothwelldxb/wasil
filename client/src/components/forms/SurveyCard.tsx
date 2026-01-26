import React, { useState } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import type { Survey } from '../../types'

interface SurveyCardProps {
  survey: Survey
  onRespond: (surveyId: string, response: string) => void
  classColors?: Record<string, { bg: string; text: string }>
}

export function SurveyCard({ survey, onRespond, classColors = {} }: SurveyCardProps) {
  const theme = useTheme()
  const [selectedOption, setSelectedOption] = useState<string | null>(
    survey.userResponse || null
  )

  const handleSubmit = () => {
    if (selectedOption) {
      onRespond(survey.id, selectedOption)
    }
  }

  const hasResponded = !!survey.userResponse
  const classColor = classColors[survey.targetClass] || {
    bg: 'bg-burgundy',
    text: 'text-white',
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <span
          className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${classColor.bg} ${classColor.text}`}
          style={
            survey.targetClass === 'Whole School'
              ? { backgroundColor: theme.colors.brandColor, color: 'white' }
              : undefined
          }
        >
          {survey.targetClass}
        </span>
        {hasResponded && (
          <span className="flex items-center space-x-1 text-green-600 text-xs font-medium">
            <Check className="h-3 w-3" />
            <span>Responded</span>
          </span>
        )}
      </div>

      <h3 className="font-semibold text-gray-900 mb-4">{survey.question}</h3>

      <div className="space-y-2">
        {survey.options.map((option) => (
          <button
            key={option}
            onClick={() => !hasResponded && setSelectedOption(option)}
            disabled={hasResponded}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
              selectedOption === option
                ? 'border-2'
                : 'border-gray-200 hover:border-gray-300'
            } ${hasResponded ? 'cursor-default' : 'cursor-pointer'}`}
            style={
              selectedOption === option
                ? { borderColor: theme.colors.brandColor, backgroundColor: `${theme.colors.brandColor}10` }
                : undefined
            }
          >
            <div className="flex items-center space-x-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedOption === option ? 'border-current' : 'border-gray-300'
                }`}
                style={
                  selectedOption === option ? { borderColor: theme.colors.brandColor } : undefined
                }
              >
                {selectedOption === option && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: theme.colors.brandColor }}
                  />
                )}
              </div>
              <span
                className={`text-sm ${
                  selectedOption === option ? 'font-medium' : 'text-gray-700'
                }`}
              >
                {option}
              </span>
            </div>
          </button>
        ))}
      </div>

      {!hasResponded && selectedOption && (
        <button
          onClick={handleSubmit}
          className="mt-4 w-full py-2 rounded-lg text-white font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          Submit Response
        </button>
      )}
    </div>
  )
}
