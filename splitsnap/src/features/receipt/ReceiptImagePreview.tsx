import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Crop, RotateCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CaptureControls } from '@/features/receipt/CaptureControls'
import type { ReceiptImage } from '@/types'

interface ReceiptImagePreviewProps {
  image: ReceiptImage
  busy?: boolean
  onCrop: () => void
  onRotate: () => void
  onDelete: () => void
  onReplace: (file: File) => void
}

/** Shows the captured receipt with edit actions (crop, rotate, delete, retake). */
export function ReceiptImagePreview({
  image,
  busy,
  onCrop,
  onRotate,
  onDelete,
  onReplace,
}: ReceiptImagePreviewProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="space-y-4">
      <motion.div
        key={image.url}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-border bg-black/90 shadow-card"
      >
        <img
          src={image.url}
          alt="Captured receipt"
          className="mx-auto max-h-[60vh] w-full object-contain"
        />
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-sm">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
      </motion.div>

      <AnimatePresence mode="wait" initial={false}>
        {confirmingDelete ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3"
          >
            <p className="flex-1 pl-1 text-sm font-medium">
              Delete this photo?
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="actions"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="grid grid-cols-3 gap-2"
          >
            <Button
              variant="secondary"
              className="flex-col gap-1 h-auto py-3"
              onClick={onCrop}
              disabled={busy}
            >
              <Crop className="!size-5" />
              <span className="text-xs font-medium">Crop</span>
            </Button>
            <Button
              variant="secondary"
              className="flex-col gap-1 h-auto py-3"
              onClick={onRotate}
              disabled={busy}
            >
              <RotateCw className="!size-5" />
              <span className="text-xs font-medium">Rotate</span>
            </Button>
            <Button
              variant="secondary"
              className="flex-col gap-1 h-auto py-3 text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
            >
              <Trash2 className="!size-5" />
              <span className="text-xs font-medium">Delete</span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-2xl border border-dashed border-border p-4">
        <p className="mb-3 text-sm font-medium text-muted-foreground">
          Not quite right? Retake or upload another.
        </p>
        <CaptureControls
          variant="inline"
          onSelect={onReplace}
          disabled={busy}
        />
      </div>
    </div>
  )
}
