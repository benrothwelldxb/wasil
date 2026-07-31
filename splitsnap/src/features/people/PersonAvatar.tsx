import { cn } from '@/lib/utils'
import { getInitials } from '@/features/people/initials'
import { contrastText } from '@/features/people/colors'
import type { Person } from '@/types'

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
} as const

interface PersonAvatarProps {
  person: Pick<Person, 'name' | 'color'>
  size?: keyof typeof sizeClasses
  className?: string
  /** Subtle ring to lift the avatar off coloured backgrounds. */
  ring?: boolean
}

/** Circular initials avatar tinted with the person's assigned colour. */
export function PersonAvatar({
  person,
  size = 'md',
  className,
  ring = true,
}: PersonAvatarProps) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold select-none',
        ring && 'ring-2 ring-background',
        sizeClasses[size],
        className,
      )}
      style={{ backgroundColor: person.color, color: contrastText(person.color) }}
      aria-hidden="true"
    >
      {getInitials(person.name)}
    </span>
  )
}
