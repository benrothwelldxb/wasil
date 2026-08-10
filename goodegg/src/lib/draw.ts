/**
 * Be a Good Egg — Secret Buddy draw engine.
 *
 * A valid draw is a permutation of participants with:
 *   • no fixed points          (nobody draws themselves)
 *   • out-degree 1 for everyone (each person gives once)
 *   • in-degree 1 for everyone  (each person receives once)
 *   • every forbidden (giver → receiver) pair from `exclusions` avoided
 *
 * Quality goals:
 *   • avoid reciprocal A→B / B→A pairs where reasonably possible
 *   • deterministic given a `seed` (so re-running never *silently* differs)
 *
 * Strategy (robust, not naive retry):
 *   1. Randomised single-cycle generator. Shuffling everyone into one big
 *      cycle yields a derangement with NO reciprocals (for n ≥ 3) by
 *      construction. We attempt a bounded number of shuffles until one also
 *      satisfies the exclusions. This is fast whenever exclusions are sparse.
 *   2. Bipartite perfect-matching fallback (Kuhn's augmenting paths) on the
 *      allowed graph. This *provably* finds an assignment if one exists, so it
 *      also detects genuine infeasibility. A 2-opt repair pass then removes
 *      reciprocal pairs where a legal swap exists.
 *
 * The function is pure: it never writes anything. Callers persist the result
 * transactionally (all pairs or none) — see the run-draw edge function.
 */

export interface DrawParticipant {
  id: string
}

export interface DrawExclusionPair {
  giver_id: string
  receiver_id: string
}

export interface DrawPair {
  giver_id: string
  receiver_id: string
}

export interface DrawOptions {
  /** Seed for deterministic output. Same inputs + seed ⇒ identical draw. */
  seed?: number
  /** Try to avoid reciprocal pairs. Default true. */
  avoidReciprocal?: boolean
  /** How many random single-cycle shuffles to try before falling back. */
  maxCycleAttempts?: number
}

export interface DrawResult {
  pairs: DrawPair[]
  /** Number of reciprocal A↔B pairs remaining (0 is ideal). */
  reciprocalCount: number
  method: 'cycle' | 'matching'
}

export type DrawErrorCode = 'TOO_FEW' | 'INFEASIBLE' | 'DUPLICATE_IDS'

export class DrawError extends Error {
  code: DrawErrorCode
  constructor(code: DrawErrorCode, message: string) {
    super(message)
    this.name = 'DrawError'
    this.code = code
  }
}

/** Deterministic PRNG (mulberry32) — small, fast, good enough for shuffling. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = a[i]!
    a[i] = a[j]!
    a[j] = tmp
  }
  return a
}

/**
 * Compute a valid Secret Buddy draw or throw a DrawError.
 */
export function computeDraw(
  participants: readonly DrawParticipant[],
  exclusions: readonly DrawExclusionPair[] = [],
  options: DrawOptions = {},
): DrawResult {
  const {
    seed = 0x9e3779b9,
    avoidReciprocal = true,
    maxCycleAttempts = 200,
  } = options

  const ids = participants.map((p) => p.id)
  const n = ids.length

  if (n < 2) {
    throw new DrawError('TOO_FEW', 'A draw needs at least two participants.')
  }
  if (new Set(ids).size !== n) {
    throw new DrawError('DUPLICATE_IDS', 'Participant ids must be unique.')
  }

  const index = new Map(ids.map((id, i) => [id, i]))

  // forbidden[i] = set of receiver indices giver i may not be given.
  // Every giver is forbidden from themselves.
  const forbidden: Set<number>[] = ids.map((_, i) => new Set<number>([i]))
  for (const ex of exclusions) {
    const g = index.get(ex.giver_id)
    const r = index.get(ex.receiver_id)
    if (g === undefined || r === undefined) continue // exclusion refers to a non-participant
    forbidden[g]!.add(r)
  }

  // Quick feasibility guard: someone forbidden from everyone can never be matched.
  for (let i = 0; i < n; i++) {
    if (forbidden[i]!.size >= n) {
      throw new DrawError(
        'INFEASIBLE',
        'No valid draw exists — the exclusions are too restrictive.',
      )
    }
  }

  const rng = makeRng(seed)

  // --- Strategy 1: randomised single cycle (reciprocal-free by construction) ---
  for (let attempt = 0; attempt < maxCycleAttempts; attempt++) {
    const order = shuffled(ids.map((_, i) => i), rng)
    let ok = true
    for (let k = 0; k < n; k++) {
      const g = order[k]!
      const r = order[(k + 1) % n]!
      if (forbidden[g]!.has(r)) {
        ok = false
        break
      }
    }
    if (ok) {
      const assign = new Array<number>(n)
      for (let k = 0; k < n; k++) assign[order[k]!] = order[(k + 1) % n]!
      // A single cycle of length n ≥ 3 has zero reciprocals; n === 2 has one.
      const reciprocalCount = n === 2 ? 1 : 0
      return { pairs: toPairs(ids, assign), reciprocalCount, method: 'cycle' }
    }
  }

  // --- Strategy 2: bipartite perfect matching (guaranteed if feasible) ---
  const adjacency: number[][] = ids.map((_, i) => {
    const list: number[] = []
    for (let j = 0; j < n; j++) if (!forbidden[i]!.has(j)) list.push(j)
    return shuffled(list, rng)
  })

  const matchReceiverToGiver = new Array<number>(n).fill(-1)

  function augment(giver: number, seen: boolean[]): boolean {
    for (const receiver of adjacency[giver]!) {
      if (seen[receiver]) continue
      seen[receiver] = true
      if (
        matchReceiverToGiver[receiver] === -1 ||
        augment(matchReceiverToGiver[receiver]!, seen)
      ) {
        matchReceiverToGiver[receiver] = giver
        return true
      }
    }
    return false
  }

  for (let g = 0; g < n; g++) {
    const seen = new Array<boolean>(n).fill(false)
    if (!augment(g, seen)) {
      throw new DrawError(
        'INFEASIBLE',
        'No valid draw exists — the exclusions are too restrictive.',
      )
    }
  }

  // assign[giver] = receiver
  const assign = new Array<number>(n)
  for (let r = 0; r < n; r++) assign[matchReceiverToGiver[r]!] = r

  if (avoidReciprocal) reduceReciprocals(assign, forbidden, rng)

  return {
    pairs: toPairs(ids, assign),
    reciprocalCount: countReciprocals(assign),
    method: 'matching',
  }
}

function toPairs(ids: readonly string[], assign: readonly number[]): DrawPair[] {
  return assign.map((r, g) => ({ giver_id: ids[g]!, receiver_id: ids[r]! }))
}

function countReciprocals(assign: readonly number[]): number {
  let count = 0
  for (let i = 0; i < assign.length; i++) {
    const j = assign[i]!
    if (i < j && assign[j] === i) count++
  }
  return count
}

/**
 * 2-opt repair: for each reciprocal pair (i↔j), look for a partner k whose
 * receiver can be swapped in without breaking any constraint, removing the
 * reciprocal. Best-effort — some configurations have no legal swap.
 */
function reduceReciprocals(
  assign: number[],
  forbidden: Set<number>[],
  rng: () => number,
): void {
  const order = shuffled(assign.map((_, i) => i), rng)
  for (const i of order) {
    const j = assign[i]!
    if (assign[j] !== i || i === j) continue // not (or no longer) reciprocal
    // Try to rewire with some other giver k: i→j, k→l  ⇒  i→l, k→j.
    // Keep the swap only if it strictly reduces the reciprocal count and
    // breaks no exclusion.
    for (const k of shuffled(order, rng)) {
      if (k === i || k === j) continue
      const l = assign[k]!
      if (l === i || l === j) continue
      if (forbidden[i]!.has(l) || forbidden[k]!.has(j)) continue
      const before = countReciprocals(assign)
      assign[i] = l
      assign[k] = j
      if (countReciprocals(assign) < before) break
      assign[i] = j // revert
      assign[k] = l
    }
  }
}

/** Validate a set of pairs against the rules. Used by tests and guards. */
export function validateDraw(
  participants: readonly DrawParticipant[],
  pairs: readonly DrawPair[],
  exclusions: readonly DrawExclusionPair[] = [],
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const ids = new Set(participants.map((p) => p.id))
  const givers = new Set<string>()
  const receivers = new Set<string>()
  const forbidden = new Set(exclusions.map((e) => `${e.giver_id}->${e.receiver_id}`))

  for (const { giver_id, receiver_id } of pairs) {
    if (!ids.has(giver_id)) errors.push(`Unknown giver ${giver_id}`)
    if (!ids.has(receiver_id)) errors.push(`Unknown receiver ${receiver_id}`)
    if (giver_id === receiver_id) errors.push(`${giver_id} was assigned themselves`)
    if (givers.has(giver_id)) errors.push(`${giver_id} gives more than once`)
    if (receivers.has(receiver_id)) errors.push(`${receiver_id} receives more than once`)
    if (forbidden.has(`${giver_id}->${receiver_id}`))
      errors.push(`Excluded pair used: ${giver_id}->${receiver_id}`)
    givers.add(giver_id)
    receivers.add(receiver_id)
  }
  if (givers.size !== ids.size) errors.push('Not every participant gives exactly once')
  if (receivers.size !== ids.size)
    errors.push('Not every participant receives exactly once')

  return { valid: errors.length === 0, errors }
}
