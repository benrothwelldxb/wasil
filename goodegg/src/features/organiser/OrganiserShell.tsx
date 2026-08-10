import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { WordmarkInline } from '@/components/brand/Wordmark'

interface OrganiserShellProps {
  title?: string
  backTo?: string
  children: React.ReactNode
}

/** Wider, desktop-friendly frame for organiser screens (never a stretched phone). */
export function OrganiserShell({ title, backTo, children }: OrganiserShellProps) {
  const navigate = useNavigate()
  return (
    <div className="min-h-dvh bg-cream-100">
      <header className="border-b border-cream-300 bg-cream-50/80 backdrop-blur safe-top">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/hq" aria-label="Secret Buddy HQ">
            <WordmarkInline className="text-lg" />
          </Link>
          <Link to="/app" className="text-sm font-semibold text-lilac-deep">
            Participant view
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5 safe-bottom">
        {(title || backTo) && (
          <div className="mb-4 flex items-center gap-2">
            {backTo && (
              <button
                onClick={() => navigate(backTo)}
                aria-label="Back"
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream-200"
              >
                <ArrowLeft size={20} aria-hidden />
              </button>
            )}
            {title && <h1 className="font-display text-2xl text-ink">{title}</h1>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
