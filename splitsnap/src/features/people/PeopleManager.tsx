import { AnimatePresence, motion } from 'framer-motion'
import { Users, X } from 'lucide-react'

import { AddPersonForm } from '@/features/people/AddPersonForm'
import { PersonAvatar } from '@/features/people/PersonAvatar'
import { usePeople } from '@/features/people/usePeople'

/**
 * Self-contained roster manager: add people, see them as initials avatars,
 * and remove them. Everything is persisted in IndexedDB via usePeople, so the
 * list is remembered across sessions.
 */
export function PeopleManager() {
  const { people, isLoading, addPerson, removePerson } = usePeople()

  return (
    <div className="space-y-4">
      <AddPersonForm onAdd={addPerson} />

      {!isLoading && people && people.length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-border px-6 py-8 text-center">
          <Users className="mb-1 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">No people yet</p>
          <p className="text-sm text-muted-foreground">
            Add the people you split bills with. They’ll be here next time.
          </p>
        </div>
      )}

      {people && people.length > 0 && (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {people.map((person) => (
              <motion.li
                key={person.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-soft"
              >
                <PersonAvatar person={person} />
                <span className="flex-1 truncate font-medium">
                  {person.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${person.name}`}
                  onClick={() => removePerson(person.id)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
