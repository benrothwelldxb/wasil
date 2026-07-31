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

/** How a service charge is divided between people. */
export type ServiceChargeMode = 'equal' | 'proportional' | 'manual'

/** A detected/entered service charge and how to split it. */
export interface ServiceCharge {
  /**
   * Flat amount in the receipt currency, used when `percent` is null
   * (a detected charge or a custom amount). 0 = none.
   */
  amount: number
  /**
   * Discretionary percentage of the items subtotal (e.g. 12.5). When set, the
   * effective charge derives from the subtotal and `amount` is ignored.
   */
  percent: number | null
  mode: ServiceChargeMode
  /** People it's assigned to when mode is 'manual'. */
  assignedTo: string[]
}

/** A single line item on a receipt. */
export interface ReceiptItem {
  id: string
  label: string
  /** Unit price. Line total = price × quantity. */
  price: number
  quantity: number
  /** Ids of the people this item is shared between (equal split). */
  assignedTo: string[]
  /**
   * Optional per-person unit counts. When present, the line is split by these
   * counts instead of equally (e.g. Ann ×4, Bob ×7). Absent = equal split.
   */
  shares?: Record<string, number>
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
