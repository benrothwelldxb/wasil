import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { TextInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { EggMascot } from '@/components/brand/EggMascot'
import { Spinner } from '@/components/ui/states'
import { useRequestOtp, useVerifyOtp } from '@/data/hooks'
import { provider } from '@/data'

/**
 * Passwordless sign-in with a 6-digit email code. Used by the app's auth guard
 * and the join flow when running against a real backend (api / supabase). The
 * local demo never reaches this screen.
 */
export function SignInScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/app'

  const requestOtp = useRequestOtp()
  const verifyOtp = useVerifyOtp()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await requestOtp.mutateAsync({ email: email.trim(), displayName: name.trim() || undefined })
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code.')
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await verifyOtp.mutateAsync({ email: email.trim(), code: code.trim() })
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code was not right.')
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-app bg-cream-100 px-5 safe-top safe-bottom">
      <ScreenHeader onBack={() => (step === 'code' ? setStep('email') : navigate('/'))} />
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <EggMascot mood={step === 'code' ? 'peek' : 'wave'} className="h-24 w-24" />
        <h1 className="font-display text-3xl text-ink">
          {step === 'email' ? 'Sign in' : 'Check your email'}
        </h1>
        <p className="max-w-xs text-sm text-ink-muted">
          {step === 'email'
            ? 'No passwords here. We’ll email you a 6-digit code.'
            : `We sent a 6-digit code to ${email}. Pop it in below.`}
        </p>
      </div>

      <Card tone="cream" className="mt-8">
        <CardBody>
          {step === 'email' ? (
            <form onSubmit={sendCode} className="space-y-4">
              <TextInput
                label="Your name"
                placeholder="e.g. Sam"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <TextInput
                label="Email"
                type="email"
                inputMode="email"
                placeholder="you@work.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p className="text-sm text-coral-deep">{error}</p>}
              <Button type="submit" size="lg" fullWidth disabled={!email.trim() || requestOtp.isPending}>
                {requestOtp.isPending ? <Spinner className="border-cream-50/40 border-t-cream-50" /> : 'Email me a code'}
              </Button>
              {provider.kind === 'api' && (
                <p className="text-center text-xs text-ink-muted">
                  No email provider configured? The code is printed in the server logs (dev mode).
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <TextInput
                label="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
                className="text-center font-mono text-2xl tracking-[0.4em]"
              />
              {error && <p className="text-sm text-coral-deep">{error}</p>}
              <Button type="submit" size="lg" fullWidth disabled={code.length < 6 || verifyOtp.isPending}>
                {verifyOtp.isPending ? <Spinner className="border-cream-50/40 border-t-cream-50" /> : 'Verify & continue'}
              </Button>
              <button
                type="button"
                onClick={sendCode}
                className="w-full text-center text-sm font-semibold text-lilac-deep"
              >
                Resend code
              </button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
