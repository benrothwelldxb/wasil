import { forwardRef } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-lilac-deep focus-visible:ring-offset-2 focus-visible:ring-offset-cream-100 select-none'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-cream-50 shadow-pill hover:bg-ink/90',
  secondary: 'bg-cream-300 text-ink hover:bg-cream-400',
  ghost: 'bg-transparent text-ink hover:bg-cream-200',
  outline: 'bg-transparent text-ink border-2 border-ink/15 hover:border-ink/30',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-12 px-5 text-[0.95rem]',
  lg: 'h-14 px-6 text-base',
}

interface CommonProps {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

export interface ButtonProps
  extends CommonProps,
    React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...props}
    />
  )
})

export interface ButtonLinkProps extends CommonProps, LinkProps {}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...props}
    />
  )
}
