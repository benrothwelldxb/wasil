import { cn } from '@/lib/cn'
import { avatarBg, initials } from '@/lib/utils'

interface AvatarProps {
  name: string
  seed?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-24 w-24 text-3xl',
}

/** A friendly, deterministic pastel avatar with the person's initials. */
export function Avatar({ name, seed, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-ink ring-2 ring-white',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: avatarBg(seed ?? name) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}
