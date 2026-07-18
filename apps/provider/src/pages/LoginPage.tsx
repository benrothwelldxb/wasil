import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { ApiError } from '../api'
import { useProviderAuth } from '../auth'

export function LoginPage() {
  const { login } = useProviderAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-warm-text-primary">Provider Portal</h1>
          <p className="text-sm text-warm-text-secondary mt-1">Manage your clubs and bookings for Wasil Connect</p>
        </div>

        <form onSubmit={handleSubmit} className="warm-card p-6 space-y-4">
          {error && (
            <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-warm-text-primary mb-1.5">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-warm-btn border border-warm-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-warm-text-primary mb-1.5">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-warm-btn border border-warm-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-warm-btn bg-brand text-white font-semibold py-2.5 text-sm disabled:opacity-60 transition-opacity"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-warm-text-tertiary mt-6">
          Invited to manage a provider? Use the link in your invitation email to set up your account.
        </p>
      </div>
    </div>
  )
}
