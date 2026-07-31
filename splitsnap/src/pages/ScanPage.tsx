import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ScanLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  CaptureControls,
  ImageCropper,
  ReceiptImagePreview,
  useReceiptImage,
} from '@/features/receipt'
import type { NormalizedRect } from '@/features/receipt'

type Mode = 'idle' | 'preview' | 'crop'

export function ScanPage() {
  const navigate = useNavigate()
  const { image, isProcessing, capture, rotate, crop, remove } =
    useReceiptImage()
  const [mode, setMode] = useState<Mode>('idle')

  const handleSelect = async (file: File) => {
    await capture(file)
    setMode('preview')
  }

  const handleApplyCrop = async (rect: NormalizedRect) => {
    await crop(rect)
    setMode('preview')
  }

  const handleDelete = () => {
    remove()
    setMode('idle')
  }

  const showPreview = image && mode === 'preview'
  const showCrop = image && mode === 'crop'
  const showIntro = !image || mode === 'idle'

  return (
    <div>
      <PageHeader
        title="Scan"
        description="Snap or upload a photo of your receipt to get started."
      />

      <AnimatePresence mode="wait">
        {showIntro && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
              <span className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 text-accent-strong">
                <ScanLine className="h-8 w-8" />
              </span>
              <h2 className="text-lg font-semibold">Capture your receipt</h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Lay it flat, fill the frame, and keep it in focus for the best
                results.
              </p>
              <CaptureControls
                className="mt-6 max-w-sm"
                onSelect={handleSelect}
                disabled={isProcessing}
              />
            </div>
          </motion.div>
        )}

        {showCrop && (
          <motion.div
            key="crop"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ImageCropper
              image={image}
              busy={isProcessing}
              onApply={handleApplyCrop}
              onCancel={() => setMode('preview')}
            />
          </motion.div>
        )}

        {showPreview && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            <ReceiptImagePreview
              image={image}
              busy={isProcessing}
              onCrop={() => setMode('crop')}
              onRotate={() => rotate(90)}
              onDelete={handleDelete}
              onReplace={handleSelect}
            />

            <Button
              size="lg"
              className="w-full"
              disabled={isProcessing}
              onClick={() => navigate('/review')}
            >
              Looks good — continue
              <ArrowRight />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
