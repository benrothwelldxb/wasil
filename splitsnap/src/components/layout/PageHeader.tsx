import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Consistent page title block used at the top of each screen. */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-6 flex items-start justify-between gap-4',
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
