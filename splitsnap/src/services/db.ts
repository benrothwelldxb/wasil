import Dexie, { type Table } from 'dexie'

import type { Person } from '@/types'

/**
 * On-device database (IndexedDB via Dexie). Everything MyReceiptSplit remembers
 * between sessions lives here — no backend, no cloud.
 */
export class SplitSnapDB extends Dexie {
  people!: Table<Person, string>

  constructor() {
    super('splitsnap')
    this.version(1).stores({
      // Indexed fields; the full Person object is stored regardless.
      people: 'id, name, createdAt',
    })
  }
}

export const db = new SplitSnapDB()
