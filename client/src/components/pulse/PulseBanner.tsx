import React from 'react'
import { FileText, ArrowRight, CheckCircle } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import type { PulseSurvey } from '../../types'

interface PulseBannerProps {
  pulse: PulseSurvey
  onStartSurvey: () => void
}

export function PulseBanner({ pulse, onStartSurvey }: PulseBannerProps) {
  const theme = useTheme()
  const hasCompleted = !!pulse.userResponse

  return (
    <div
      className="rounded-2xl shadow-sm p-6"
      style={
        hasCompleted
          ? { backgroundColor: 'white', border: '1px solid #e5e7eb' }
          : { backgroundColor: '#fef9e7', border: '2px solid #D4AF37' }
      }
    >
      <div className="flex items-start space-x-4">
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: hasCompleted ? '#dcfce7' : `${theme.colors.accentColor}50` }}
        >
          {hasCompleted ? (
            <CheckCircle className="h-8 w-8 text-green-600" />
          ) : (
            <FileText className="h-8 w-8" style={{ color: theme.colors.brandColor }} />
          )}
        </div>
        <div className="flex-1">
          {hasCompleted ? (
            <>
              <h2 className="text-xl font-bold text-green-700">
                Thank You for Your Feedback!
              </h2>
              <p className="text-gray-600 mt-1">
                You've completed the {pulse.halfTermName} Parent Pulse survey. Your feedback helps us improve.
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Submitted on {new Date(pulse.userResponse!.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold" style={{ color: theme.colors.brandColor }}>
                1-Minute Parent Pulse
              </h2>
              <p className="text-gray-600 mt-1">
                Help us improve! Share your experience of {pulse.halfTermName}.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Closes: {new Date(pulse.closesAt).toLocaleDateString('en-GB')}
              </p>
            </>
          )}
        </div>
      </div>

      {!hasCompleted && (
        <button
          onClick={onStartSurvey}
          className="w-full mt-4 py-4 rounded-xl text-white font-semibold text-lg flex items-center justify-center space-x-2 transition-opacity hover:opacity-90"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          <span>Start Survey</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
