import { Component, type ReactNode } from 'react'
import { EggMascot } from './brand/EggMascot'
import { Button } from './ui/Button'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** App-wide error boundary with an on-brand fallback. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // In production this is where we'd report to an error service.
    console.error('Uncaught error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-4 bg-cream-100 px-8 text-center">
          <EggMascot mood="default" className="h-28 w-28" />
          <h1 className="font-display text-2xl text-ink">Well, that’s a cracked egg</h1>
          <p className="text-sm text-ink-muted">
            Something went wrong. A refresh usually sorts it.
          </p>
          <Button onClick={() => window.location.assign('/')}>Back to safety</Button>
        </div>
      )
    }
    return this.props.children
  }
}
