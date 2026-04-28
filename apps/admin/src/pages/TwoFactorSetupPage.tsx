import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useTheme, api } from '@wasil/shared'
import { Copy, Check, ShieldCheck } from 'lucide-react'

export function TwoFactorSetupPage() {
  const { user, refreshUser } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()

  const [step, setStep] = useState<'loading' | 'setup' | 'confirm' | 'done'>('loading')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [confirmCode, setConfirmCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [copiedCodes, setCopiedCodes] = useState(false)
  const confirmInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user?.twoFactorEnabled) {
      navigate('/analytics', { replace: true })
      return
    }
    initSetup()
  }, [])

  const initSetup = async () => {
    try {
      const data = await api.auth.setup2fa()
      setQrCode(data.qrCode)
      setSecret(data.secret)
      setRecoveryCodes(data.recoveryCodes)
      setStep('setup')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize 2FA setup')
    }
  }

  const handleConfirm = async () => {
    if (confirmCode.length !== 6 || isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      await api.auth.confirmSetup2fa(confirmCode)
      setStep('done')
      await refreshUser()
      setTimeout(() => navigate('/analytics', { replace: true }), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
      setConfirmCode('')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Auto-submit on 6 digits
  useEffect(() => {
    if (confirmCode.length === 6 && step === 'confirm') {
      handleConfirm()
    }
  }, [confirmCode])

  const copyToClipboard = async (text: string, type: 'secret' | 'codes') => {
    await navigator.clipboard.writeText(text)
    if (type === 'secret') {
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
    } else {
      setCopiedCodes(true)
      setTimeout(() => setCopiedCodes(false), 2000)
    }
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Setting up two-factor authentication...</div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: `${theme.colors.brandColor}15` }}
          >
            <ShieldCheck className="w-8 h-8" style={{ color: theme.colors.brandColor }} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">2FA Enabled</h2>
          <p className="text-sm text-slate-500">Your account is now protected. Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full">
        <div className="text-center mb-6">
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
            style={{ backgroundColor: `${theme.colors.brandColor}15` }}
          >
            <ShieldCheck className="w-6 h-6" style={{ color: theme.colors.brandColor }} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Set Up Two-Factor Authentication</h2>
          <p className="text-sm text-slate-500 mt-1">
            {step === 'setup'
              ? 'Scan the QR code with your authenticator app and save your recovery codes'
              : 'Enter the 6-digit code from your authenticator to confirm setup'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl text-sm font-medium bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

        {step === 'setup' && (
          <div className="space-y-6">
            {/* QR Code */}
            <div className="flex flex-col items-center">
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <img src={qrCode} alt="QR Code" className="w-48 h-48" />
              </div>
            </div>

            {/* Manual entry */}
            <div>
              <p className="text-xs text-slate-500 mb-1">Can't scan? Enter this key manually:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-slate-50 rounded-lg text-xs font-mono text-slate-700 break-all">
                  {secret}
                </code>
                <button
                  onClick={() => copyToClipboard(secret, 'secret')}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  {copiedSecret ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Recovery codes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-900">Recovery Codes</p>
                <button
                  onClick={() => copyToClipboard(recoveryCodes.join('\n'), 'codes')}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                >
                  {copiedCodes ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copiedCodes ? 'Copied' : 'Copy all'}
                </button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-2">
                <p className="text-xs text-amber-800 font-medium">
                  Save these codes in a safe place. Each code can only be used once if you lose access to your authenticator.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {recoveryCodes.map((code, i) => (
                  <code key={i} className="px-3 py-1.5 bg-slate-50 rounded text-sm font-mono text-slate-700 text-center">
                    {code}
                  </code>
                ))}
              </div>
            </div>

            <button
              onClick={() => { setStep('confirm'); setTimeout(() => confirmInputRef.current?.focus(), 100) }}
              className="w-full py-2.5 rounded-lg font-medium text-white"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              I've saved my recovery codes
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <input
              ref={confirmInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center font-mono text-2xl tracking-[0.3em] focus:ring-2 focus:ring-offset-0 focus:border-transparent"
              style={{ '--tw-ring-color': theme.colors.brandColor } as React.CSSProperties}
              placeholder="000000"
              disabled={isSubmitting}
              autoFocus
            />
            {isSubmitting && (
              <p className="text-center text-sm text-slate-500">Verifying...</p>
            )}
            <button
              type="button"
              onClick={() => { setStep('setup'); setConfirmCode(''); setError(null) }}
              className="w-full text-sm text-slate-500 hover:text-slate-700"
            >
              Back to setup
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
