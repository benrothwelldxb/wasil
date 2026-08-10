import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ScreenHeaderProps {
  title?: string
  onBack?: () => void
  right?: React.ReactNode
  className?: string
}

/** Compact header for sub-screens: back chevron, centred title, optional action. */
export function ScreenHeader({ title, onBack, right, className }: ScreenHeaderProps) {
  const navigate = useNavigate()
  return (
    <header className={cn('mb-2 flex items-center justify-between gap-2 py-2', className)}>
      <button
        type="button"
        onClick={() => (onBack ? onBack() : navigate(-1))}
        aria-label="Go back"
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-cream-200"
      >
        <ChevronLeft size={24} aria-hidden />
      </button>
      {title && <h1 className="flex-1 truncate text-center font-display text-lg font-semibold">{title}</h1>}
      <div className="flex h-10 w-10 items-center justify-center">{right}</div>
    </header>
  )
}
