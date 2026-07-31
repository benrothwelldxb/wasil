import type { Person, ReceiptItem } from '@/types'

export interface PersonTotal {
  person: Person
  /** What this person owes across all items they're assigned to. */
  amount: number
  /** How many items they're sharing. */
  itemCount: number
}

export interface SplitResult {
  totals: PersonTotal[]
  /** Cost of items nobody has been assigned to yet. */
  unassigned: number
  /** Cost that has been assigned to at least one person. */
  assigned: number
  /** Grand total of all items. */
  total: number
}

const itemCost = (item: ReceiptItem) => item.price * (item.quantity || 1)

/**
 * Split each item's cost evenly between the people assigned to it, and roll
 * that up into a per-person running total. Assignments referencing people who
 * no longer exist are ignored so money is never lost to a deleted person.
 */
export function computeSplit(
  items: ReceiptItem[],
  people: Person[],
): SplitResult {
  const byId = new Map(people.map((p) => [p.id, p]))
  const amounts = new Map<string, number>()
  const counts = new Map<string, number>()

  let total = 0
  let unassigned = 0

  for (const item of items) {
    const cost = itemCost(item)
    total += cost

    const assignees = item.assignedTo.filter((id) => byId.has(id))
    if (assignees.length === 0) {
      unassigned += cost
      continue
    }

    const share = cost / assignees.length
    for (const id of assignees) {
      amounts.set(id, (amounts.get(id) ?? 0) + share)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }

  const totals: PersonTotal[] = people.map((person) => ({
    person,
    amount: amounts.get(person.id) ?? 0,
    itemCount: counts.get(person.id) ?? 0,
  }))

  return { totals, unassigned, assigned: total - unassigned, total }
}
