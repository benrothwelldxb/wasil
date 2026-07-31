import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getInitials, contrastText } from '@/features/people'
import type { Person } from '@/types'

interface PersonChipProps {
  person: Person
  selected: boolean
  onToggle: () => void
}

/**
 * A tappable person chip. When selected it fills with the person's colour
 * (using a readable text colour for contrast); unselected it's a quiet
 * outline. Toggling is instant.
 */
export function PersonChip({ person, selected, onToggle }: PersonChipProps) {
  const fg = contrastText(person.color)

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-all active:scale-[0.97]',
        selected
          ? 'border-transparent shadow-soft'
          : 'border-border bg-background text-foreground hover:bg-secondary',
      )}
      style={selected ? { backgroundColor: person.color, color: fg } : undefined}
    >
      <span
        className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold"
        style={
          selected
            ? { backgroundColor: 'rgba(255,255,255,0.22)', color: fg }
            : { backgroundColor: person.color, color: fg }
        }
      >
        {selected ? <Check className="h-3.5 w-3.5" /> : getInitials(person.name)}
      </span>
      {person.name}
    </button>
  )
}
