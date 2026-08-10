// =============================================================================
// Be a Good Egg — run-draw edge function
//
// Trusted server-side draw runner. Flow:
//   1. Authenticate the caller from their JWT.
//   2. Verify they are the organiser of the requested group.
//   3. Load participants (group_members) and exclusions with the service role.
//   4. Run a faithful port of computeDraw() from /src/lib/draw.ts.
//   5. Guard the result with validateDraw().
//   6. Commit atomically via the apply_draw() SECURITY DEFINER RPC, which also
//      enforces idempotency (won't redraw a group that is already 'drawn').
//
// The service role key means this function bypasses RLS — it is the ONLY place
// (besides apply_draw) that ever touches the assignments table. Never expose the
// service role key to the browser.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// -----------------------------------------------------------------------------
// CORS
// -----------------------------------------------------------------------------
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// =============================================================================
// ---- Faithful port of /src/lib/draw.ts -------------------------------------
// Kept byte-for-byte equivalent to the source algorithm: mulberry32 PRNG,
// Fisher-Yates shuffle, randomised single-cycle generator, Kuhn's bipartite
// matching fallback, 2-opt reciprocal reduction, and validateDraw guard.
// =============================================================================

interface DrawParticipant {
  id: string
}

interface DrawExclusionPair {
  giver_id: string
  receiver_id: string
}

interface DrawPair {
  giver_id: string
  receiver_id: string
}

interface DrawOptions {
  seed?: number
  avoidReciprocal?: boolean
  maxCycleAttempts?: number
}

interface DrawResult {
  pairs: DrawPair[]
  reciprocalCount: number
  method: 'cycle' | 'matching'
}

type DrawErrorCode = 'TOO_FEW' | 'INFEASIBLE' | 'DUPLICATE_IDS'

class DrawError extends Error {
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

function computeDraw(
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
  const forbidden: Set<number>[] = ids.map((_, i) => new Set<number>([i]))
  for (const ex of exclusions) {
    const g = index.get(ex.giver_id)
    const r = index.get(ex.receiver_id)
    if (g === undefined || r === undefined) continue
    forbidden[g]!.add(r)
  }

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

function reduceReciprocals(
  assign: number[],
  forbidden: Set<number>[],
  rng: () => number,
): void {
  const order = shuffled(assign.map((_, i) => i), rng)
  for (const i of order) {
    const j = assign[i]!
    if (assign[j] !== i || i === j) continue
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

function validateDraw(
  participants: readonly DrawParticipant[],
  pairs: readonly DrawPair[],
  exclusions: readonly DrawExclusionPair[] = [],
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const ids = new Set(participants.map((p) => p.id))
  const givers = new Set<string>()
  const receivers = new Set<string>()
  const forbidden = new Set(
    exclusions.map((e) => `${e.giver_id}->${e.receiver_id}`),
  )

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

// =============================================================================
// ---- HTTP handler -----------------------------------------------------------
// =============================================================================

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'server_misconfigured' }, 500)
  }

  // Parse input.
  let body: {
    group_id?: string
    seed?: number
    avoidReciprocal?: boolean
    maxCycleAttempts?: number
  }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }
  const groupId = body.group_id
  if (!groupId || typeof groupId !== 'string') {
    return json({ ok: false, error: 'group_id_required' }, 400)
  }

  // Admin client (bypasses RLS). Used for all data access below.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ---- 1 & 2: authenticate caller and verify organiser -----------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }
  const callerId = userData.user.id

  const { data: group, error: groupErr } = await admin
    .from('groups')
    .select('id, organiser_id, status')
    .eq('id', groupId)
    .maybeSingle()

  if (groupErr) {
    return json({ ok: false, error: 'group_lookup_failed' }, 500)
  }
  if (!group) {
    return json({ ok: false, error: 'group_not_found' }, 404)
  }
  if (group.organiser_id !== callerId) {
    return json({ ok: false, error: 'not_organiser' }, 403)
  }

  // Early idempotency signal (apply_draw is still the authoritative guard).
  if (group.status === 'drawn' || group.status === 'revealed') {
    return json({ ok: false, error: 'already_drawn' }, 409)
  }

  // ---- 3: load participants and exclusions -----------------------------------
  const { data: members, error: membersErr } = await admin
    .from('group_members')
    .select('profile_id')
    .eq('group_id', groupId)

  if (membersErr) {
    return json({ ok: false, error: 'members_lookup_failed' }, 500)
  }

  const participants: DrawParticipant[] = (members ?? []).map((m) => ({
    id: m.profile_id as string,
  }))

  if (participants.length < 2) {
    return json({ ok: false, error: 'too_few', code: 'TOO_FEW' }, 400)
  }

  const { data: exRows, error: exErr } = await admin
    .from('exclusions')
    .select('giver_id, receiver_id')
    .eq('group_id', groupId)

  if (exErr) {
    return json({ ok: false, error: 'exclusions_lookup_failed' }, 500)
  }

  const exclusions: DrawExclusionPair[] = (exRows ?? []).map((e) => ({
    giver_id: e.giver_id as string,
    receiver_id: e.receiver_id as string,
  }))

  // ---- 4: run the draw -------------------------------------------------------
  // Seed defaults to the algorithm's own default when the caller omits one.
  const seed =
    typeof body.seed === 'number' ? body.seed >>> 0 : 0x9e3779b9

  let result: DrawResult
  try {
    result = computeDraw(participants, exclusions, {
      seed,
      avoidReciprocal: body.avoidReciprocal ?? true,
      maxCycleAttempts: body.maxCycleAttempts ?? 200,
    })
  } catch (err) {
    if (err instanceof DrawError) {
      if (err.code === 'TOO_FEW') {
        return json({ ok: false, error: err.message, code: err.code }, 400)
      }
      if (err.code === 'DUPLICATE_IDS') {
        return json({ ok: false, error: err.message, code: err.code }, 400)
      }
      // INFEASIBLE
      return json({ ok: false, error: err.message, code: err.code }, 422)
    }
    return json({ ok: false, error: 'draw_failed' }, 500)
  }

  // ---- 5: guard the result ---------------------------------------------------
  const check = validateDraw(participants, result.pairs, exclusions)
  if (!check.valid) {
    // Should be unreachable — indicates a bug in the port. Fail loud, write none.
    return json(
      { ok: false, error: 'validation_failed', details: check.errors },
      500,
    )
  }

  // ---- 6: commit atomically via apply_draw -----------------------------------
  const { data: applied, error: applyErr } = await admin.rpc('apply_draw', {
    gid: groupId,
    pairs: result.pairs,
    seed,
    p_organiser: callerId,
  })

  if (applyErr) {
    // Map custom SQLSTATEs / messages from apply_draw to HTTP codes.
    const code = (applyErr as { code?: string }).code ?? ''
    const msg = applyErr.message ?? ''
    if (code === 'GE409' || msg.includes('ALREADY_DRAWN')) {
      return json({ ok: false, error: 'already_drawn' }, 409)
    }
    if (code === 'GE403' || msg.includes('NOT_ORGANISER')) {
      return json({ ok: false, error: 'not_organiser' }, 403)
    }
    if (code === 'GE404' || msg.includes('GROUP_NOT_FOUND')) {
      return json({ ok: false, error: 'group_not_found' }, 404)
    }
    // A unique-violation here means the pairs were malformed (impossible after
    // validateDraw, but surfaced honestly rather than swallowed).
    return json({ ok: false, error: 'apply_failed', details: msg }, 500)
  }

  return json({
    ok: true,
    count: applied as number,
    reciprocalCount: result.reciprocalCount,
    method: result.method,
  })
})
