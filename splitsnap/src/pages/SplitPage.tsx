import { Users } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/EmptyState'

/** Placeholder Split screen — assign items to people and settle up. */
export function SplitPage() {
  return (
    <div>
      <PageHeader
        title="Split"
        description="Tap who had what and settle up."
      />
      <EmptyState
        icon={Users}
        title="No one to split with yet"
        description="Add people and assign items once a receipt is ready."
      />
    </div>
  )
}
