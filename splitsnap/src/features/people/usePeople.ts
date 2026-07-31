import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '@/services/db'
import { pickColor } from '@/features/people/colors'
import type { Person } from '@/types'

/**
 * Reactive access to the saved people roster. Reads stay live via Dexie's
 * useLiveQuery, so any add/remove reflects instantly across the UI, and the
 * roster is remembered between sessions in IndexedDB.
 */
export function usePeople() {
  const people = useLiveQuery(
    () => db.people.orderBy('createdAt').toArray(),
    [],
  )

  const addPerson = useCallback(async (rawName: string): Promise<Person | null> => {
    const name = rawName.trim()
    if (!name) return null

    const existing = await db.people.toArray()
    const person: Person = {
      id: crypto.randomUUID(),
      name,
      color: pickColor(existing.map((p) => p.color)),
      createdAt: Date.now(),
    }
    await db.people.add(person)
    return person
  }, [])

  const removePerson = useCallback(async (id: string) => {
    await db.people.delete(id)
  }, [])

  const renamePerson = useCallback(async (id: string, rawName: string) => {
    const name = rawName.trim()
    if (!name) return
    await db.people.update(id, { name })
  }, [])

  return {
    /** undefined while the first query is loading, then an array. */
    people,
    isLoading: people === undefined,
    addPerson,
    removePerson,
    renamePerson,
  }
}
