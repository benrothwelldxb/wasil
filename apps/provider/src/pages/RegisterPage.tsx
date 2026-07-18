import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { ApiError } from '../api'
import { useProviderAuth } from '../auth'

const PASSWORD_HINT = 'At least 8 characters with an uppercase letter, a lowercase letter, and a number.'
const isStrong = (p: string) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(p)

export function RegisterPage() {
  const { register } = useProviderAuth()
  const [params] = useSearchParams()
  const token = useMemo(() => params.get('token') || '', [params])

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isStrong(password)) return setError(PASSWORD_HINT)
    if (password !== confirm) return setError('Passwords do not match.')

    setSubmitting(true)
    try {
      await register(token, password, name.trim() || undefined)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to complete registration.')
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm warm-card p-6 text-center">
          <h1 className="text-lg font-extrabold text-warm-text-primary mb-2">Invitation required</h1>
          <p className="text-sm text-warm-text-secondary">
            This page needs an invitation link. Please open the link from your invitation email.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-warm-text-primary">Set up your account</h1>
          <p className="text-sm text-warm-text-secondary mt-1">Create a password to access the provider portal</p>
        </div>

        <form onSubmit={handleSubmit} className="warm-card p-6 space-y-4">
          {error && (
            <div className="rounded-warm bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2.5">{error}</div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-warm-text-primary mb-1.5">Your name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-warm-btn border border-warm-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-warm-text-primary mb-1.5">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-warm-btn border border-warm-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            <p className="text-xs text-warm-text-tertiary mt-1.5">{PASSWORD_HINT}</p>
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-semibold text-warm-text-primary mb-1.5">Confirm password</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full rounded-warm-btn border border-warm-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-warm-btn bg-brand text-white font-semibold py-2.5 text-sm disabled:opacity-60 transition-opacity"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Setting up…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
