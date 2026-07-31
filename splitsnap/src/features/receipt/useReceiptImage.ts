import { useCallback } from 'react'

import { useReceiptStore } from '@/features/receipt/receiptStore'
import {
  cropImage,
  fileToReceiptImage,
  rotateImage,
  type NormalizedRect,
} from '@/features/receipt/image-utils'

/**
 * Reusable actions for the current receipt image. Wraps the async canvas
 * helpers with the store so components stay declarative and error handling
 * lives in one place.
 */
export function useReceiptImage() {
  const image = useReceiptStore((s) => s.image)
  const isProcessing = useReceiptStore((s) => s.isProcessing)
  const setImage = useReceiptStore((s) => s.setImage)
  const updateImage = useReceiptStore((s) => s.updateImage)
  const clearImage = useReceiptStore((s) => s.clearImage)
  const setProcessing = useReceiptStore((s) => s.setProcessing)

  const capture = useCallback(
    async (file: Blob) => {
      setProcessing(true)
      try {
        const receiptImage = await fileToReceiptImage(file)
        setImage(receiptImage)
      } finally {
        setProcessing(false)
      }
    },
    [setImage, setProcessing],
  )

  const rotate = useCallback(
    async (degrees: 90 | 180 | 270 = 90) => {
      const current = useReceiptStore.getState().image
      if (!current) return
      setProcessing(true)
      try {
        updateImage(await rotateImage(current, degrees))
      } finally {
        setProcessing(false)
      }
    },
    [updateImage, setProcessing],
  )

  const crop = useCallback(
    async (rect: NormalizedRect) => {
      const current = useReceiptStore.getState().image
      if (!current) return
      setProcessing(true)
      try {
        updateImage(await cropImage(current, rect))
      } finally {
        setProcessing(false)
      }
    },
    [updateImage, setProcessing],
  )

  const remove = useCallback(() => clearImage(), [clearImage])

  return { image, isProcessing, capture, rotate, crop, remove }
}
