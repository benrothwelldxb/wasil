import { cn } from '@/lib/cn'

type CardTone = 'plain' | 'cream' | 'sage' | 'lilac' | 'yolk' | 'peach' | 'coral'

const tones: Record<CardTone, string> = {
  plain: 'bg-white',
  cream: 'bg-cream-200',
  sage: 'bg-sage-tint',
  lilac: 'bg-lilac-tint',
  yolk: 'bg-yolk-tint',
  peach: 'bg-peach-tint',
  coral: 'bg-coral-tint',
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  interactive?: boolean
}

export function Card({ tone = 'plain', interactive, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card shadow-card',
        tones[tone],
        interactive &&
          'cursor-pointer transition-shadow duration-150 hover:shadow-card-hover focus-within:shadow-card-hover',
        className,
      )}
      {...props}
    />
  )
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />
}
