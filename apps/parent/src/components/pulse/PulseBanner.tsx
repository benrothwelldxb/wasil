import React from 'react'
import { MessageCircle, ArrowRight, Check } from 'lucide-react'
import type { PulseSurvey } from '@wasil/shared'

interface PulseBannerProps {
  pulse: PulseSurvey
  onStartSurvey: () => void
}

export function PulseBanner({ pulse, onStartSurvey }: PulseBannerProps) {
  const hasCompleted = !!pulse.userResponse

  if (hasCompleted) {
    return (
      <div
        style={{
          borderRadius: '22px',
          border: '1.5px solid rgba(91,169,123,0.2)',
          backgroundColor: '#EDFAF2',
          padding: '18px',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '14px',
              backgroundColor: 'rgba(91,169,123,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Check style={{ width: '22px', height: '22px', color: '#5BA97B' }} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#5BA97B' }}>
              Thank you for your feedback!
            </h3>
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#7A6469', marginTop: '2px' }}>
              {pulse.halfTermName} survey completed
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        borderRadius: '22px',
        background: 'linear-gradient(135deg, #8B6EAE, #A78BC1)',
        padding: '22px 20px',
        color: '#FFFFFF',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative circle */}
      <div
        style={{
          position: 'absolute',
          top: '-20px',
          right: '-20px',
          width: '100px',
          height: '100px',
          borderRadius: '50px',
          background: 'rgba(255,255,255,0.08)',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="flex items-center gap-3 mb-2">
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '14px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MessageCircle style={{ width: '22px', height: '22px', color: '#FFFFFF' }} />
          </div>
          <div>
            <h3 style={{ fontSize: '17px', fontWeight: 800 }}>
              1-Minute Parent Pulse
            </h3>
            <p style={{ fontSize: '13px', fontWeight: 500, opacity: 0.85 }}>
              Share your experience of {pulse.halfTermName}
            </p>
          </div>
        </div>
        <p style={{ fontSize: '12px', fontWeight: 600, opacity: 0.6, marginBottom: '14px' }}>
          Closes {new Date(pulse.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </p>
        <button
          onClick={onStartSurvey}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '14px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: '#FFFFFF',
            fontSize: '15px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span>Start Survey</span>
          <ArrowRight style={{ width: '18px', height: '18px' }} />
        </button>
      </div>
    </div>
  )
}
