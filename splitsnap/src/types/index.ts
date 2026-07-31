/**
 * Core domain types for MyReceiptSplit.
 *
 * The app models a single flow: a captured receipt image → parsed line items
 * → people → an assignment of items to people. Everything lives on-device.
 */

/** A person sharing the bill. */
export interface Person {
  id: string
  name: string
  /** Hex colour automatically assigned for avatars/chips. */
  color: string
  /** When the person was first saved (used for stable ordering). */
  createdAt: number
}

/** A single line item on a receipt. */
export interface ReceiptItem {
  id: string
  label: string
  price: number
  quantity: number
  /** Ids of the people this item is shared between. */
  assignedTo: string[]
}

/** A captured receipt photo held in application state (not yet OCR'd). */
export interface ReceiptImage {
  id: string
  /** Object URL for display in the current session. */
  url: string
  /** The underlying image data, kept for cropping/persistence. */
  blob: Blob
  width: number
  height: number
  createdAt: number
}

/** A full receipt/split session. */
export interface Receipt {
  id: string
  image?: ReceiptImage
  merchant?: string
  currency: string
  items: ReceiptItem[]
  people: Person[]
  subtotal?: number
  tax?: number
  tip?: number
  total?: number
  createdAt: number
  updatedAt: number
}
