import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api, useAuth, useTheme, config } from '@wasil/shared'
import type { InvitationValidationResponse } from '@wasil/shared'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const theme = useTheme()
  const { defaultSchool } = config

  const [code, setCode] = useState(searchParams.get('code') || '')
  const [token] = useState(searchParams.get('token') || '')
  const [error, setError] = useState(searchParams.get('error') || '')
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<InvitationValidationResponse | null>(null)
  const [isRedeeming, setIsRedeeming] = useState(false)

  // Check for stored invitation after OAuth callback
  useEffect(() => {
    const storedCode = sessionStorage.getItem('pendingInvitationCode')
    const storedToken = sessionStorage.getItem('pendingInvitationToken')

    if (isAuthenticated && (storedCode || storedToken)) {
      redeemInvitation(storedCode || undefined, storedToken || undefined)
    }
  }, [isAuthenticated])

  // Auto-validate if code or token is provided in URL
  useEffect(() => {
    if (token && !validationResult) {
      validateInvitation(undefined, token)
    }
  }, [token])

  const validateInvitation = async (codeToValidate?: string, tokenToValidate?: string) => {
    const validateCode = codeToValidate || code
    const validateToken = tokenToValidate || token

    if (!validateCode && !validateToken) {
      setError('Please enter an access code')
      return
    }

    setIsValidating(true)
    setError('')

    try {
      const result = await api.parentInvitations.validate({
        code: validateCode || undefined,
        token: validateToken || undefined,
      })
      setValidationResult(result)

      // Store for after OAuth
      if (validateCode) {
        sessionStorage.setItem('pendingInvitationCode', validateCode)
      }
      if (validateToken) {
        sessionStorage.setItem('pendingInvitationToken', validateToken)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid access code or link')
      setValidationResult(null)
    } finally {
      setIsValidating(false)
    }
  }

  const redeemInvitation = async (codeToRedeem?: string, tokenToRedeem?: string) => {
    setIsRedeeming(true)
    setError('')

    try {
      await api.parentInvitations.redeem({
        code: codeToRedeem,
        token: tokenToRedeem,
      })

      // Clear stored invitation
      sessionStorage.removeItem('pendingInvitationCode')
      sessionStorage.removeItem('pendingInvitationToken')

      // Redirect to dashboard
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete registration')
    } finally {
      setIsRedeeming(false)
    }
  }

  const formatCode = (value: string) => {
    // Remove non-alphanumeric characters and convert to uppercase
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '')

    // Format as ABC-123-XYZ
    if (cleaned.length <= 3) return cleaned
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 9)}`
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCode(e.target.value)
    setCode(formatted)
    setError('')
    setValidationResult(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    validateInvitation()
  }

  const handleOAuth = (provider: 'google' | 'microsoft') => {
    // Store invitation code/token before OAuth redirect
    if (code) sessionStorage.setItem('pendingInvitationCode', code)
    if (token) sessionStorage.setItem('pendingInvitationToken', token)

    // Redirect to OAuth with a special callback that will return to register
    window.location.href = `${API_URL}/auth/${provider}?returnTo=register`
  }

  const getErrorMessage = (errorCode: string) => {
    switch (errorCode) {
      case 'invalid': return 'This invitation link is invalid.'
      case 'expired': return 'This invitation has expired.'
      case 'revoked': return 'This invitation has been revoked.'
      case 'redeemed': return 'This invitation has already been used.'
      case 'server': return 'Something went wrong. Please try again.'
      default: return errorCode
    }
  }

  // Show loading while redeeming after OAuth
  if (isRedeeming) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: theme.colors.brandColor }} />
          <p className="text-gray-600">Completing registration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          {validationResult?.school?.logoUrl ? (
            <img
              src={validationResult.school.logoUrl}
              alt={validationResult.school.name}
              className="h-24 w-auto mx-auto mb-4"
            />
          ) : (
            <img
              src={theme.logoUrl}
              alt="School"
              className="h-24 w-auto mx-auto mb-4"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/school-logo.png'
              }}
            />
          )}
          <h2 className="text-2xl font-bold" style={{ color: validationResult?.school?.brandColor || theme.colors.brandColor }}>
            Parent Registration
          </h2>
          {validationResult?.school && (
            <p className="text-gray-600 mt-2">{validationResult.school.name}</p>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {getErrorMessage(error)}
          </div>
        )}

        {!validationResult ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter your access code
              </label>
              <input
                type="text"
                value={code}
                onChange={handleCodeChange}
                placeholder="ABC-123-XYZ"
                maxLength={11}
                className="w-full px-4 py-3 text-center text-xl font-mono tracking-wider border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                autoFocus
                disabled={isValidating}
              />
              <p className="text-xs text-gray-500 mt-2 text-center">
                You should have received this code from your school
              </p>
            </div>

            <button
              type="submit"
              disabled={isValidating || code.length < 11}
              className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              {isValidating ? 'Checking...' : 'Continue'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already registered?{' '}
              <a href="/login" className="font-medium" style={{ color: theme.colors.brandColor }}>
                Sign in
              </a>
            </p>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-medium text-center">
                Invitation verified!
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                {validationResult.parentName
                  ? `Welcome, ${validationResult.parentName}!`
                  : 'Your children will be linked to your account:'}
              </p>
              <ul className="space-y-2">
                {validationResult.children.map((child, index) => (
                  <li key={index} className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                    <span className="font-medium">{child.childName}</span>
                    <span className="mx-2 text-gray-400">-</span>
                    <span>{child.className}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-center text-gray-600 mb-4">
                Sign in with your account to complete registration
              </p>

              <button
                onClick={() => handleOAuth('google')}
                className="w-full flex items-center justify-center space-x-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-gray-700 font-medium">Continue with Google</span>
              </button>

              <button
                onClick={() => handleOAuth('microsoft')}
                className="w-full flex items-center justify-center space-x-3 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 23 23">
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
                <span className="text-gray-700 font-medium">Continue with Microsoft</span>
              </button>
            </div>

            <button
              onClick={() => {
                setValidationResult(null)
                setCode('')
                sessionStorage.removeItem('pendingInvitationCode')
                sessionStorage.removeItem('pendingInvitationToken')
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Use a different code
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-500 mt-8">
          By registering, you agree to our Terms of Service and Privacy Policy
        </p>

        <div
          className="mt-8 -mx-8 -mb-8 px-8 py-4 rounded-b-2xl flex items-center justify-center space-x-2"
          style={{ backgroundColor: validationResult?.school?.brandColor || theme.colors.brandColor }}
        >
          <span className="text-white text-sm opacity-80">Powered by</span>
          <img
            src={defaultSchool.wasilLogoWhite}
            alt="Wasil"
            className="h-5 w-auto"
          />
        </div>
      </div>
    </div>
  )
}
