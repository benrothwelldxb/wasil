import { create } from 'zustand'

import type {
  ReceiptImage,
  ReceiptItem,
  ServiceCharge,
  ServiceChargeMode,
} from '@/types'
import type { CurrencyCode } from '@/lib/currency'
import { useSettingsStore } from '@/features/settings/settingsStore'

/** Fields of an item the user can edit directly in the review step. */
export type EditableItemFields = Partial<
  Pick<ReceiptItem, 'label' | 'price' | 'quantity'>
>

const DEFAULT_SERVICE_CHARGE: ServiceCharge = {
  amount: 0,
  mode: 'proportional',
  assignedTo: [],
}

interface ReceiptState {
  /** The receipt photo currently being worked on (in-memory only). */
  image: ReceiptImage | null
  /** True while an async edit (crop/rotate/decode) is running. */
  isProcessing: boolean
  /** Parsed / manually entered line items for the current receipt. */
  items: ReceiptItem[]
  /** Detected/entered service charge and how it's split. */
  serviceCharge: ServiceCharge
  /** Currency for the current receipt (detected from OCR or chosen). */
  currency: CurrencyCode

  /** Set a freshly captured/uploaded image, releasing any previous one. */
  setImage: (image: ReceiptImage) => void
  /**
   * Replace the pixels of the current image (after crop/rotate) while keeping
   * its identity, and release the previous object URL.
   */
  updateImage: (next: { blob: Blob; width: number; height: number }) => void
  /** Remove the current image and release its object URL. */
  clearImage: () => void
  setProcessing: (value: boolean) => void

  /** Replace all line items (e.g. after an OCR pass). */
  setItems: (items: ReceiptItem[]) => void
  /** Append a blank item and return its id so the UI can focus it. */
  addItem: () => string
  /** Patch an item's editable fields. */
  updateItem: (id: string, patch: EditableItemFields) => void
  /** Remove a single item. */
  removeItem: (id: string) => void
  /** Toggle whether a person is assigned to an item. */
  toggleAssignment: (itemId: string, personId: string) => void
  /** Replace the full set of assignees for an item (e.g. "everyone"). */
  setAssignees: (itemId: string, personIds: string[]) => void

  /** Set the service-charge amount (0 removes it). */
  setServiceChargeAmount: (amount: number) => void
  /** Choose how the service charge is split. */
  setServiceChargeMode: (mode: ServiceChargeMode) => void
  /** Toggle a person for a manually-assigned service charge. */
  toggleServiceChargeAssignee: (personId: string) => void

  /** Set the currency for the current receipt. */
  setCurrency: (currency: CurrencyCode) => void

  /** Clear the whole session (image + items + service charge). */
  reset: () => void
}

function revoke(image: ReceiptImage | null) {
  if (image) URL.revokeObjectURL(image.url)
}

function createBlankItem(): ReceiptItem {
  return {
    id: crypto.randomUUID(),
    label: '',
    price: 0,
    quantity: 1,
    assignedTo: [],
  }
}

export const useReceiptStore = create<ReceiptState>((set, get) => ({
  serviceCharge: { ...DEFAULT_SERVICE_CHARGE },
  currency: useSettingsStore.getState().defaultCurrency,
  image: null,
  isProcessing: false,
  items: [],

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

  setItems: (items) => set({ items }),

  addItem: () => {
    const item = createBlankItem()
    set((state) => ({ items: [...state.items, item] }))
    return item.id
  },

  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

  toggleAssignment: (itemId, personId) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              assignedTo: item.assignedTo.includes(personId)
                ? item.assignedTo.filter((id) => id !== personId)
                : [...item.assignedTo, personId],
            }
          : item,
      ),
    })),

  setAssignees: (itemId, personIds) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId ? { ...item, assignedTo: personIds } : item,
      ),
    })),

  setServiceChargeAmount: (amount) =>
    set((state) => ({
      serviceCharge: {
        ...state.serviceCharge,
        amount: Math.max(0, amount) || 0,
      },
    })),

  setServiceChargeMode: (mode) =>
    set((state) => ({
      serviceCharge: { ...state.serviceCharge, mode },
    })),

  toggleServiceChargeAssignee: (personId) =>
    set((state) => {
      const { assignedTo } = state.serviceCharge
      return {
        serviceCharge: {
          ...state.serviceCharge,
          assignedTo: assignedTo.includes(personId)
            ? assignedTo.filter((id) => id !== personId)
            : [...assignedTo, personId],
        },
      }
    }),

  setCurrency: (currency) => set({ currency }),

  reset: () => {
    revoke(get().image)
    set({
      image: null,
      items: [],
      serviceCharge: { ...DEFAULT_SERVICE_CHARGE },
      currency: useSettingsStore.getState().defaultCurrency,
    })
  },
}))
