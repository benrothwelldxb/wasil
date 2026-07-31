import { ReceiptText } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/EmptyState'

/** Placeholder Review screen — line-item editing arrives with OCR. */
export function ReviewPage() {
  return (
    <div>
      <PageHeader
        title="Review"
        description="Check and tidy up the receipt items."
      />
      <EmptyState
        icon={ReceiptText}
        title="Nothing to review yet"
        description="Scan a receipt first and its items will show up here."
      />
    </div>
  )
}
