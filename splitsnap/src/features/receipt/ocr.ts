import { createWorker, type LoggerMessage } from 'tesseract.js'

import type { ReceiptImage, ReceiptItem } from '@/types'
import {
  parseReceiptItems,
  parseServiceCharge,
  type ParsedItem,
} from '@/features/receipt/receipt-parse'

export { parseReceiptItems, parseServiceCharge }
export type { ParsedItem }

export interface OcrProgress {
  /** Raw Tesseract status, e.g. "recognizing text". */
  status: string
  /** 0–1 progress within the current status. */
  progress: number
}

/** Give parsed items stable ids so they can be edited/assigned. */
export function toReceiptItems(parsed: ParsedItem[]): ReceiptItem[] {
  return parsed.map((p) => ({
    id: crypto.randomUUID(),
    label: p.label,
    price: p.price,
    quantity: p.quantity,
    assignedTo: [],
  }))
}

/**
 * Run Tesseract OCR over a receipt image and return the recognized text.
 * Progress is streamed via the callback so the UI can show a live bar.
 */
export async function runOcr(
  image: ReceiptImage,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const worker = await createWorker('eng', 1, {
    logger: (m: LoggerMessage) => {
      if (typeof m.progress === 'number') {
        onProgress?.({ status: m.status, progress: m.progress })
      }
    },
  })

  try {
    const { data } = await worker.recognize(image.blob)
    return data.text
  } finally {
    await worker.terminate()
  }
}
