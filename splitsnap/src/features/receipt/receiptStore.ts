import { create } from 'zustand'

import type { ReceiptImage } from '@/types'

interface ReceiptState {
  /** The receipt photo currently being worked on (in-memory only). */
  image: ReceiptImage | null
  /** True while an async edit (crop/rotate/decode) is running. */
  isProcessing: boolean

  /** Set a freshly captured/uploaded image, releasing any previous one. */
  setImage: (image: ReceiptImage) => void
  /**
   * Replace the pixels of the current image (after crop/rotate) while keeping
   * its identity, and release the previous object URL.
   */
  updateImage: (next: {
    blob: Blob
    width: number
    height: number
  }) => void
  /** Remove the current image and release its object URL. */
  clearImage: () => void
  setProcessing: (value: boolean) => void
}

function revoke(image: ReceiptImage | null) {
  if (image) URL.revokeObjectURL(image.url)
}

export const useReceiptStore = create<ReceiptState>((set, get) => ({
  image: null,
  isProcessing: false,

  setImage: (image) => {
    revoke(get().image)
    set({ image })
  },

  updateImage: ({ blob, width, height }) => {
    const current = get().image
    if (!current) return
    revoke(current)
    set({
      image: {
        ...current,
        blob,
        width,
        height,
        url: URL.createObjectURL(blob),
      },
    })
  },

  clearImage: () => {
    revoke(get().image)
    set({ image: null })
  },

  setProcessing: (value) => set({ isProcessing: value }),
}))
