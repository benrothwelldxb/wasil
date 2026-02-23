import React, { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api, useTheme, config, setTokens } from '@wasil/shared'
import type { InvitationValidationResponse } from '@wasil/shared'
import { Eye, EyeOff } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const theme = useTheme()
  const { defaultSchool } = config

  const [code, setCode] = useState(searchParams.get('code') || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(searchParams.get('error') || '')
  const [isValidating, setIsValidating] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [validationResult, setValidationResult] = useState<InvitationValidationResponse | null>(null)

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      setError('Please enter your email address')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!validationResult?.invitationId) {
      setError('Invalid invitation. Please try again.')
      return
    }

    setIsRegistering(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitationId: validationResult.invitationId,
          email: email.toLowerCase(),
          password,
          name: validationResult.parentName,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed')
      }

      // Set tokens and redirect to home
      setTokens(data.accessToken, data.refreshToken)
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setIsRegistering(false)
    }
  }

  const formatCode = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
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

            {(validationResult.children.length > 0 || validationResult.students?.length > 0) && (
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
                  {validationResult.students?.map((student, index) => (
                    <li key={`s-${index}`} className="flex items-center text-sm text-gray-600">
                      <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                      <span className="font-medium">{student.studentName}</span>
                      <span className="mx-2 text-gray-400">-</span>
                      <span>{student.className}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
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
                  disabled={isRegistering}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Create password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setError('')
                    }}
                    placeholder="At least 8 characters"
                    className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isRegistering}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value)
                    setError('')
                  }}
                  placeholder="Enter password again"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isRegistering}
                />
              </div>

              <button
                type="submit"
                disabled={isRegistering || !email || !password || !confirmPassword}
                className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: validationResult?.school?.brandColor || theme.colors.brandColor }}
              >
                {isRegistering ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <button
              onClick={() => {
                setValidationResult(null)
                setCode('')
                setEmail('')
                setPassword('')
                setConfirmPassword('')
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
