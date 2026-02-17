import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, useTheme, config } from '@wasil/shared'
import type { InvitationValidationResponse } from '@wasil/shared'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const theme = useTheme()
  const { defaultSchool } = config

  const [code, setCode] = useState(searchParams.get('code') || '')
  const [email, setEmail] = useState('')
  const [error, setError] = useState(searchParams.get('error') || '')
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<InvitationValidationResponse | null>(null)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const validateInvitation = async (codeToValidate?: string) => {
    const validateCode = codeToValidate || code

    if (!validateCode) {
      setError('Please enter an access code')
      return
    }

    setIsValidating(true)
    setError('')

    try {
      const result = await api.parentInvitations.validate({
        code: validateCode,
      })
      setValidationResult(result)
      // Pre-fill email if provided in invitation
      if (result.parentEmail) {
        setEmail(result.parentEmail)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid access code')
      setValidationResult(null)
    } finally {
      setIsValidating(false)
    }
  }

  const sendMagicLink = async () => {
    if (!email || !validationResult?.invitationId) {
      setError('Please enter your email address')
      return
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    setIsSendingEmail(true)
    setError('')

    try {
      // First, update the invitation with the email if different
      // Then send the magic link
      const response = await fetch(`${API_URL}/auth/magic-link/send-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitationId: validationResult.invitationId,
          email: email.toLowerCase(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send email')
      }

      setEmailSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link')
    } finally {
      setIsSendingEmail(false)
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

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMagicLink()
  }

  const getErrorMessage = (errorCode: string) => {
    switch (errorCode) {
      case 'invalid': return 'This invitation code is invalid.'
      case 'expired': return 'This invitation has expired.'
      case 'revoked': return 'This invitation has been revoked.'
      case 'redeemed': return 'This invitation has already been used.'
      case 'server': return 'Something went wrong. Please try again.'
      default: return errorCode
    }
  }

  // Show success message after email is sent
  if (emailSent) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h2>
          <p className="text-gray-600 mb-6">
            We've sent a magic link to<br />
            <span className="font-medium text-gray-900">{email}</span>
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Click the link in the email to complete your registration. The link will expire in 15 minutes.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => sendMagicLink()}
              disabled={isSendingEmail}
              className="text-sm font-medium hover:underline"
              style={{ color: theme.colors.brandColor }}
            >
              {isSendingEmail ? 'Sending...' : 'Resend email'}
            </button>
            <div className="text-sm text-gray-400">or</div>
            <button
              onClick={() => {
                setEmailSent(false)
                setEmail('')
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Use a different email
            </button>
          </div>
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

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter your email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError('')
                  }}
                  placeholder="your.email@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                  disabled={isSendingEmail}
                />
                <p className="text-xs text-gray-500 mt-2">
                  We'll send you a magic link to complete registration
                </p>
              </div>

              <button
                type="submit"
                disabled={isSendingEmail || !email}
                className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {isSendingEmail ? 'Sending...' : 'Send Magic Link'}
              </button>
            </form>

            <button
              onClick={() => {
                setValidationResult(null)
                setCode('')
                setEmail('')
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
