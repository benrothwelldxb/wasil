import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { TextInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { EggMascot } from '@/components/brand/EggMascot'

export function JoinCodeScreen() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c) navigate(`/join/${c}`)
  }

  return (
    <div className="mx-auto min-h-dvh max-w-app bg-cream-100 px-4 safe-top safe-bottom">
      <ScreenHeader title="Join a group" onBack={() => navigate('/')} />
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <EggMascot mood="peek" className="h-28 w-28" />
        <h2 className="font-display text-2xl text-ink">Got an invite code?</h2>
        <p className="max-w-xs text-ink-muted">
          Enter the code from your organiser, or scan their QR code to jump straight in.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <TextInput
          label="Join code"
          placeholder="e.g. GOODEGG"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoFocus
          className="text-center font-mono text-lg tracking-widest"
        />
        <Button type="submit" size="lg" fullWidth disabled={!code.trim()}>
          Continue
        </Button>
      </form>
    </div>
  )
}
