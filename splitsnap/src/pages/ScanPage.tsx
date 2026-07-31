import { Camera } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/EmptyState'

/**
 * Placeholder Scan screen. Camera capture, upload, crop, rotate and delete
 * are implemented in a later step.
 */
export function ScanPage() {
  return (
    <div>
      <PageHeader
        title="Scan"
        description="Snap or upload a photo of your receipt."
      />
      <EmptyState
        icon={Camera}
        title="Receipt capture coming next"
        description="This is where you'll take or upload a photo of the receipt."
      />
    </div>
  )
}
