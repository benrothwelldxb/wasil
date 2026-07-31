import type { Person, ReceiptItem, ServiceCharge } from '@/types'

export interface PersonTotal {
  person: Person
  /** Share of item costs. */
  itemsAmount: number
  /** Share of the service charge. */
  serviceAmount: number
  /** Everything this person owes (items + service). */
  amount: number
  /** How many items they're sharing. */
  itemCount: number
}

export interface SplitResult {
  totals: PersonTotal[]
  /** Total of all item costs. */
  itemsTotal: number
  /** Item cost nobody has been assigned to yet. */
  unassignedItems: number
  /** The service charge amount being split. */
  serviceCharge: number
  /** Service charge that couldn't be allocated (e.g. manual with nobody set). */
  serviceUnassigned: number
  /** Everything still unallocated (items + service). */
  unassigned: number
  /** Grand total (items + service charge). */
  total: number
}

const itemCost = (item: ReceiptItem) => item.price * (item.quantity || 1)

const NO_SERVICE: ServiceCharge = { amount: 0, mode: 'proportional', assignedTo: [] }

/**
 * Split each item's cost evenly between the people assigned to it, then add
 * the service charge on top according to its mode:
 *  - equal        → divided evenly across everyone in the roster
 *  - proportional → in proportion to each person's item spend
 *  - manual       → divided evenly across the people it's assigned to
 *
 * Assignments referencing people who no longer exist are ignored so money is
 * never lost to a deleted person.
 */
export function computeSplit(
  items: ReceiptItem[],
  people: Person[],
  service: ServiceCharge = NO_SERVICE,
): SplitResult {
  const byId = new Map(people.map((p) => [p.id, p]))
  const itemsAmount = new Map<string, number>()
  const serviceAmount = new Map<string, number>()
  const counts = new Map<string, number>()

  let itemsTotal = 0
  let unassignedItems = 0

  for (const item of items) {
    const cost = itemCost(item)
    itemsTotal += cost

    const assignees = item.assignedTo.filter((id) => byId.has(id))
    if (assignees.length === 0) {
      unassignedItems += cost
      continue
    }

    const share = cost / assignees.length
    for (const id of assignees) {
      itemsAmount.set(id, (itemsAmount.get(id) ?? 0) + share)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }

  // Distribute the service charge.
  const serviceTotal = Math.max(0, service.amount) || 0
  let serviceUnassigned = 0

  if (serviceTotal > 0) {
    if (service.mode === 'equal') {
      if (people.length > 0) {
        const share = serviceTotal / people.length
        for (const p of people) {
          serviceAmount.set(p.id, (serviceAmount.get(p.id) ?? 0) + share)
        }
      } else {
        serviceUnassigned = serviceTotal
      }
    } else if (service.mode === 'proportional') {
      const base = itemsTotal - unassignedItems // total assigned to people
      if (base > 0) {
        for (const p of people) {
          const spend = itemsAmount.get(p.id) ?? 0
          serviceAmount.set(p.id, (spend / base) * serviceTotal)
        }
      } else {
        serviceUnassigned = serviceTotal
      }
    } else {
      // manual
      const assignees = service.assignedTo.filter((id) => byId.has(id))
      if (assignees.length > 0) {
        const share = serviceTotal / assignees.length
        for (const id of assignees) {
          serviceAmount.set(id, (serviceAmount.get(id) ?? 0) + share)
        }
      } else {
        serviceUnassigned = serviceTotal
      }
    }
  }

  const totals: PersonTotal[] = people.map((person) => {
    const its = itemsAmount.get(person.id) ?? 0
    const svc = serviceAmount.get(person.id) ?? 0
    return {
      person,
      itemsAmount: its,
      serviceAmount: svc,
      amount: its + svc,
      itemCount: counts.get(person.id) ?? 0,
    }
  })

  return {
    totals,
    itemsTotal,
    unassignedItems,
    serviceCharge: serviceTotal,
    serviceUnassigned,
    unassigned: unassignedItems + serviceUnassigned,
    total: itemsTotal + serviceTotal,
  }
}
