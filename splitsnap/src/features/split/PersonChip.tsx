import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getInitials } from '@/features/people'
import type { Person } from '@/types'

interface PersonChipProps {
  person: Person
  selected: boolean
  onToggle: () => void
}

/**
 * A tappable person chip. When selected it fills with the person's colour;
 * unselected it's a quiet outline. Toggling is instant.
 */
export function PersonChip({ person, selected, onToggle }: PersonChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-all active:scale-[0.97]',
        selected
          ? 'border-transparent text-white shadow-soft'
          : 'border-border bg-background text-foreground hover:bg-secondary',
      )}
      style={selected ? { backgroundColor: person.color } : undefined}
    >
      <span
        className={cn(
          'grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold',
          selected ? 'bg-white/25 text-white' : 'text-white',
        )}
        style={selected ? undefined : { backgroundColor: person.color }}
      >
        {selected ? <Check className="h-3.5 w-3.5" /> : getInitials(person.name)}
      </span>
      {person.name}
    </button>
  )
}
