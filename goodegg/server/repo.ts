/**
 * Repository — every database read/write, with authorisation enforced here.
 *
 * This is the security boundary that RLS provides on Supabase. In particular:
 *   • `assignments` is never returned to a client; the only read is the caller's
 *     own receiver, via getMyBuddy().
 *   • listParticipants returns names + completion only — never preferences or
 *     matches.
 *   • received questions are returned WITHOUT sender_id.
 *   • the draw is organiser-only, idempotent, and written in one transaction.
 */
import type {
  AnonymousQuestion,
  BuddyProfile,
  Exclusion,
  Group,
  GroupMember,
  GroupStatus,
  InboxItem,
  Membership,
  Mission,
  ParticipantSummary,
  Profile,
} from '../src/lib/types'
import { computeDraw, validateDraw } from '../src/lib/draw'
import { makeJoinCode, uid } from '../src/lib/utils'
import type { Db, Queryable } from './db'
import { codeExpiry, generateCode, hashCode } from './auth'
import { sendLoginCode } from './email'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// ---- row → domain mappers (coerce timestamps to ISO strings) --------------
function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
function isoOrNull(v: unknown): string | null {
  if (v == null) return null
  return iso(v)
}
type Row = Record<string, unknown>

function toProfile(r: Row): Profile {
  return {
    id: r.id as string,
    display_name: r.display_name as string,
    email: (r.email as string) ?? null,
    avatar_seed: (r.avatar_seed as string) ?? null,
    created_at: iso(r.created_at),
  }
}
function toGroup(r: Row): Group {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    organiser_id: r.organiser_id as string,
    status: r.status as GroupStatus,
    join_code: r.join_code as string,
    suggested_budget: (r.suggested_budget as number) ?? null,
    created_at: iso(r.created_at),
    draw_at: isoOrNull(r.draw_at),
    reveal_date: (r.reveal_date as string) ?? null,
  }
}
function toMember(r: Row): GroupMember {
  return {
    id: r.id as string,
    group_id: r.group_id as string,
    profile_id: r.profile_id as string,
    role: r.role as GroupMember['role'],
    joined_at: iso(r.joined_at),
    profile_complete: !!r.profile_complete,
  }
}
function toBuddy(r: Row): BuddyProfile {
  return {
    id: r.id as string,
    group_id: r.group_id as string,
    profile_id: r.profile_id as string,
    preferred_name: r.preferred_name as string,
    birthday: (r.birthday as string) ?? null,
    drink: r.drink as string,
    sweet_or_savoury: (r.sweet_or_savoury as BuddyProfile['sweet_or_savoury']) ?? null,
    favourite_snacks: (r.favourite_snacks as string[]) ?? [],
    favourite_shops: (r.favourite_shops as string[]) ?? [],
    interests: (r.interests as string[]) ?? [],
    favourite_colours: (r.favourite_colours as string[]) ?? [],
    little_things: r.little_things as string,
    dislikes: (r.dislikes as string[]) ?? [],
    dietary_requirements: (r.dietary_requirements as string[]) ?? [],
    free_text: r.free_text as string,
    updated_at: iso(r.updated_at),
  }
}
function toQuestion(r: Row): AnonymousQuestion {
  return {
    id: r.id as string,
    group_id: r.group_id as string,
    sender_id: r.sender_id as string,
    recipient_id: r.recipient_id as string,
    question: r.question as string,
    answer: (r.answer as string) ?? null,
    status: r.status as AnonymousQuestion['status'],
    created_at: iso(r.created_at),
    answered_at: isoOrNull(r.answered_at),
  }
}
function toMission(r: Row): Mission {
  return {
    id: r.id as string,
    group_id: r.group_id as string,
    title: r.title as string,
    tagline: r.tagline as string,
    body: r.body as string,
    accent: r.accent as Mission['accent'],
    starts_at: (r.starts_at as string) ?? null,
    ends_at: (r.ends_at as string) ?? null,
    created_at: iso(r.created_at),
  }
}
function toExclusion(r: Row): Exclusion {
  return {
    id: r.id as string,
    group_id: r.group_id as string,
    giver_id: r.giver_id as string,
    receiver_id: r.receiver_id as string,
    reason: (r.reason as string) ?? null,
    created_at: iso(r.created_at),
  }
}

// ---- authz helpers --------------------------------------------------------
async function getGroupRow(db: Queryable, id: string): Promise<Group> {
  const { rows } = await db.query('select * from groups where id = $1', [id])
  if (!rows[0]) throw new ApiError(404, 'not_found', 'Group not found.')
  return toGroup(rows[0])
}
async function requireMember(db: Queryable, callerId: string, groupId: string): Promise<GroupMember> {
  const { rows } = await db.query(
    'select * from group_members where group_id = $1 and profile_id = $2',
    [groupId, callerId],
  )
  if (!rows[0]) throw new ApiError(403, 'not_member', 'You are not in this group.')
  return toMember(rows[0])
}
async function requireOrganiser(db: Queryable, callerId: string, groupId: string): Promise<Group> {
  const group = await getGroupRow(db, groupId)
  if (group.organiser_id !== callerId) {
    throw new ApiError(403, 'not_organiser', 'Only the organiser can do this.')
  }
  return group
}

// ---- auth -----------------------------------------------------------------
/**
 * Create/refresh a sign-in code and deliver it by email. Returns the code so
 * server-side callers/tests can use it; the HTTP route never exposes it — the
 * only real delivery channel is the email.
 */
export async function requestOtp(db: Db, email: string, displayName?: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new ApiError(400, 'bad_email', 'Please enter a valid email address.')
  }
  const code = generateCode()
  await db.query(
    `insert into login_codes (email, code_hash, display_name, attempts, expires_at)
     values ($1, $2, $3, 0, $4)
     on conflict (email) do update set
       code_hash = excluded.code_hash,
       display_name = excluded.display_name,
       attempts = 0,
       expires_at = excluded.expires_at,
       created_at = now()`,
    [normalized, hashCode(normalized, code), displayName?.trim() ?? null, codeExpiry()],
  )
  await sendLoginCode(normalized, code)
  return code
}

export async function verifyOtp(
  db: Db,
  email: string,
  code: string,
): Promise<{ profile: Profile }> {
  const normalized = email.trim().toLowerCase()
  const { rows } = await db.query('select * from login_codes where email = $1', [normalized])
  const row = rows[0]
  if (!row) throw new ApiError(400, 'no_code', 'Request a code first.')
  if (new Date(iso(row.expires_at)).getTime() < Date.now()) {
    throw new ApiError(400, 'expired', 'That code has expired. Please request a new one.')
  }
  if ((row.attempts as number) >= 5) {
    throw new ApiError(429, 'too_many', 'Too many attempts. Request a new code.')
  }
  if (hashCode(normalized, code.trim()) !== row.code_hash) {
    await db.query('update login_codes set attempts = attempts + 1 where email = $1', [normalized])
    throw new ApiError(400, 'bad_code', 'That code is not right.')
  }

  const displayName = (row.display_name as string) || normalized.split('@')[0] || 'Good Egg'
  const existing = await db.query('select * from profiles where email = $1', [normalized])
  let profile: Profile
  if (existing.rows[0]) {
    profile = toProfile(existing.rows[0])
    if (row.display_name) {
      const upd = await db.query(
        'update profiles set display_name = $2 where id = $1 returning *',
        [profile.id, displayName],
      )
      profile = toProfile(upd.rows[0]!)
    }
  } else {
    const ins = await db.query(
      `insert into profiles (id, display_name, email, avatar_seed)
       values ($1, $2, $3, $4) returning *`,
      [uid('prof-'), displayName, normalized, uid('seed-')],
    )
    profile = toProfile(ins.rows[0]!)
  }
  await db.query('delete from login_codes where email = $1', [normalized])
  return { profile }
}

export async function getProfile(db: Db, id: string): Promise<Profile | null> {
  const { rows } = await db.query('select * from profiles where id = $1', [id])
  return rows[0] ? toProfile(rows[0]) : null
}

export async function updateProfile(
  db: Db,
  callerId: string,
  patch: { display_name?: string; avatar_seed?: string },
): Promise<Profile> {
  const { rows } = await db.query(
    `update profiles set
       display_name = coalesce($2, display_name),
       avatar_seed = coalesce($3, avatar_seed)
     where id = $1 returning *`,
    [callerId, patch.display_name ?? null, patch.avatar_seed ?? null],
  )
  return toProfile(rows[0]!)
}

// ---- groups ---------------------------------------------------------------
export interface CreateGroupInput {
  name: string
  organiser_name: string
  description?: string
  reveal_date?: string | null
  suggested_budget?: number | null
}

export async function createGroup(db: Db, callerId: string, input: CreateGroupInput): Promise<Group> {
  return db.tx(async (q) => {
    if (input.organiser_name?.trim()) {
      await q.query('update profiles set display_name = $2 where id = $1', [
        callerId,
        input.organiser_name.trim(),
      ])
    }
    const groupId = uid('grp-')
    const { rows } = await q.query(
      `insert into groups (id, name, description, organiser_id, status, join_code, suggested_budget, reveal_date)
       values ($1, $2, $3, $4, 'open', $5, $6, $7) returning *`,
      [
        groupId,
        input.name.trim(),
        input.description?.trim() ?? null,
        callerId,
        makeJoinCode(),
        input.suggested_budget ?? null,
        input.reveal_date ?? null,
      ],
    )
    await q.query(
      `insert into group_members (id, group_id, profile_id, role) values ($1, $2, $3, 'organiser')`,
      [uid('mem-'), groupId, callerId],
    )
    return toGroup(rows[0]!)
  })
}

export async function getGroup(db: Db, id: string): Promise<Group | null> {
  const { rows } = await db.query('select * from groups where id = $1', [id])
  return rows[0] ? toGroup(rows[0]) : null
}

export async function getGroupByCode(db: Db, code: string): Promise<Group | null> {
  const { rows } = await db.query('select * from groups where join_code = $1', [
    code.trim().toUpperCase(),
  ])
  return rows[0] ? toGroup(rows[0]) : null
}

export async function updateGroup(
  db: Db,
  callerId: string,
  groupId: string,
  patch: Partial<Pick<Group, 'name' | 'description' | 'reveal_date' | 'suggested_budget'>>,
): Promise<Group> {
  await requireOrganiser(db, callerId, groupId)
  const { rows } = await db.query(
    `update groups set
       name = coalesce($2, name),
       description = $3,
       reveal_date = $4,
       suggested_budget = $5
     where id = $1 returning *`,
    [
      groupId,
      patch.name ?? null,
      patch.description ?? null,
      patch.reveal_date ?? null,
      patch.suggested_budget ?? null,
    ],
  )
  return toGroup(rows[0]!)
}

export async function setGroupStatus(
  db: Db,
  callerId: string,
  groupId: string,
  status: GroupStatus,
): Promise<Group> {
  await requireOrganiser(db, callerId, groupId)
  const { rows } = await db.query('update groups set status = $2 where id = $1 returning *', [
    groupId,
    status,
  ])
  return toGroup(rows[0]!)
}

export async function listMyMemberships(db: Db, callerId: string): Promise<Membership[]> {
  const { rows } = await db.query(
    `select gm.*, row_to_json(g.*) as group
     from group_members gm join groups g on g.id = gm.group_id
     where gm.profile_id = $1 order by gm.joined_at desc`,
    [callerId],
  )
  return rows.map((r) => ({ group: toGroup(r.group as Row), member: toMember(r) }))
}

// ---- membership -----------------------------------------------------------
export async function joinGroup(
  db: Db,
  callerId: string,
  code: string,
  displayName: string,
): Promise<Membership> {
  const group = await getGroupByCode(db, code)
  if (!group) throw new ApiError(404, 'bad_code', 'That join code did not match a group.')
  return db.tx(async (q) => {
    if (displayName?.trim()) {
      await q.query('update profiles set display_name = $2 where id = $1', [callerId, displayName.trim()])
    }
    const existing = await q.query(
      'select * from group_members where group_id = $1 and profile_id = $2',
      [group.id, callerId],
    )
    let member: GroupMember
    if (existing.rows[0]) {
      member = toMember(existing.rows[0])
    } else {
      const ins = await q.query(
        `insert into group_members (id, group_id, profile_id, role) values ($1, $2, $3, 'participant') returning *`,
        [uid('mem-'), group.id, callerId],
      )
      member = toMember(ins.rows[0]!)
    }
    return { group, member }
  })
}

export async function getMyMembership(
  db: Db,
  callerId: string,
  groupId: string,
): Promise<GroupMember | null> {
  const { rows } = await db.query(
    'select * from group_members where group_id = $1 and profile_id = $2',
    [groupId, callerId],
  )
  return rows[0] ? toMember(rows[0]) : null
}

export async function listParticipants(
  db: Db,
  callerId: string,
  groupId: string,
): Promise<ParticipantSummary[]> {
  await requireMember(db, callerId, groupId)
  const { rows } = await db.query(
    `select gm.id as member_id, gm.profile_id, gm.role, gm.profile_complete, gm.joined_at,
            p.display_name, p.avatar_seed
     from group_members gm join profiles p on p.id = gm.profile_id
     where gm.group_id = $1 order by p.display_name asc`,
    [groupId],
  )
  return rows.map((r) => ({
    member_id: r.member_id as string,
    profile_id: r.profile_id as string,
    display_name: r.display_name as string,
    avatar_seed: (r.avatar_seed as string) ?? null,
    role: r.role as GroupMember['role'],
    profile_complete: !!r.profile_complete,
    joined_at: iso(r.joined_at),
  }))
}

export async function removeParticipant(
  db: Db,
  callerId: string,
  groupId: string,
  memberId: string,
): Promise<void> {
  const group = await requireOrganiser(db, callerId, groupId)
  if (group.status === 'drawn' || group.status === 'revealed') {
    throw new ApiError(409, 'already_drawn', 'You cannot remove people after the draw.')
  }
  await db.query('delete from group_members where id = $1 and group_id = $2 and role <> $3', [
    memberId,
    groupId,
    'organiser',
  ])
}

// ---- buddy profile --------------------------------------------------------
export interface BuddyProfileInput {
  preferred_name: string
  birthday?: string | null
  drink: string
  sweet_or_savoury: BuddyProfile['sweet_or_savoury']
  favourite_snacks: string[]
  favourite_shops: string[]
  interests: string[]
  favourite_colours: string[]
  little_things: string
  dislikes: string[]
  dietary_requirements: string[]
  free_text: string
}

export async function getMyBuddyProfile(
  db: Db,
  callerId: string,
  groupId: string,
): Promise<BuddyProfile | null> {
  const { rows } = await db.query(
    'select * from buddy_profiles where group_id = $1 and profile_id = $2',
    [groupId, callerId],
  )
  return rows[0] ? toBuddy(rows[0]) : null
}

export async function upsertMyBuddyProfile(
  db: Db,
  callerId: string,
  groupId: string,
  input: BuddyProfileInput,
): Promise<BuddyProfile> {
  await requireMember(db, callerId, groupId)
  const complete =
    !!input.drink.trim() &&
    (input.interests.length > 0 ||
      input.favourite_snacks.length > 0 ||
      input.little_things.trim().length > 0)
  return db.tx(async (q) => {
    const { rows } = await q.query(
      `insert into buddy_profiles
         (id, group_id, profile_id, preferred_name, birthday, drink, sweet_or_savoury,
          favourite_snacks, favourite_shops, interests, favourite_colours, little_things,
          dislikes, dietary_requirements, free_text, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
       on conflict (group_id, profile_id) do update set
         preferred_name = excluded.preferred_name,
         birthday = excluded.birthday,
         drink = excluded.drink,
         sweet_or_savoury = excluded.sweet_or_savoury,
         favourite_snacks = excluded.favourite_snacks,
         favourite_shops = excluded.favourite_shops,
         interests = excluded.interests,
         favourite_colours = excluded.favourite_colours,
         little_things = excluded.little_things,
         dislikes = excluded.dislikes,
         dietary_requirements = excluded.dietary_requirements,
         free_text = excluded.free_text,
         updated_at = now()
       returning *`,
      [
        uid('bp-'),
        groupId,
        callerId,
        input.preferred_name,
        input.birthday ?? null,
        input.drink,
        input.sweet_or_savoury ?? null,
        input.favourite_snacks,
        input.favourite_shops,
        input.interests,
        input.favourite_colours,
        input.little_things,
        input.dislikes,
        input.dietary_requirements,
        input.free_text,
      ],
    )
    await q.query(
      'update group_members set profile_complete = $3 where group_id = $1 and profile_id = $2',
      [groupId, callerId, complete],
    )
    return toBuddy(rows[0]!)
  })
}

/** The only read path to a buddy: the caller's OWN receiver. */
export async function getMyBuddy(
  db: Db,
  callerId: string,
  groupId: string,
): Promise<BuddyProfile | null> {
  const asg = await db.query(
    'select receiver_id from assignments where group_id = $1 and giver_id = $2',
    [groupId, callerId],
  )
  const receiverId = asg.rows[0]?.receiver_id as string | undefined
  if (!receiverId) return null
  const bp = await db.query(
    'select * from buddy_profiles where group_id = $1 and profile_id = $2',
    [groupId, receiverId],
  )
  if (bp.rows[0]) return toBuddy(bp.rows[0])
  // Fall back to an empty profile bearing the receiver's name.
  const p = await db.query('select display_name from profiles where id = $1', [receiverId])
  const name = (p.rows[0]?.display_name as string) ?? 'Your buddy'
  return {
    id: `bp-${receiverId}`,
    group_id: groupId,
    profile_id: receiverId,
    preferred_name: name,
    birthday: null,
    drink: '',
    sweet_or_savoury: null,
    favourite_snacks: [],
    favourite_shops: [],
    interests: [],
    favourite_colours: [],
    little_things: '',
    dislikes: [],
    dietary_requirements: [],
    free_text: '',
    updated_at: new Date().toISOString(),
  }
}

export async function getMyReceiverId(
  db: Db,
  callerId: string,
  groupId: string,
): Promise<string | null> {
  const { rows } = await db.query(
    'select receiver_id from assignments where group_id = $1 and giver_id = $2',
    [groupId, callerId],
  )
  return (rows[0]?.receiver_id as string) ?? null
}

export async function hasRevealed(db: Db, callerId: string, groupId: string): Promise<boolean> {
  const { rows } = await db.query(
    'select revealed_at from group_members where group_id = $1 and profile_id = $2',
    [groupId, callerId],
  )
  return !!rows[0]?.revealed_at
}

export async function markRevealed(db: Db, callerId: string, groupId: string): Promise<void> {
  await db.query(
    'update group_members set revealed_at = now() where group_id = $1 and profile_id = $2 and revealed_at is null',
    [groupId, callerId],
  )
}

// ---- exclusions -----------------------------------------------------------
export async function listExclusions(db: Db, callerId: string, groupId: string): Promise<Exclusion[]> {
  await requireOrganiser(db, callerId, groupId)
  const { rows } = await db.query('select * from exclusions where group_id = $1', [groupId])
  return rows.map(toExclusion)
}

export async function addExclusion(
  db: Db,
  callerId: string,
  groupId: string,
  giverId: string,
  receiverId: string,
  reason?: string,
): Promise<Exclusion> {
  await requireOrganiser(db, callerId, groupId)
  const { rows } = await db.query(
    `insert into exclusions (id, group_id, giver_id, receiver_id, reason)
     values ($1,$2,$3,$4,$5)
     on conflict (group_id, giver_id, receiver_id) do update set reason = excluded.reason
     returning *`,
    [uid('exc-'), groupId, giverId, receiverId, reason ?? null],
  )
  return toExclusion(rows[0]!)
}

export async function removeExclusion(
  db: Db,
  callerId: string,
  groupId: string,
  exclusionId: string,
): Promise<void> {
  await requireOrganiser(db, callerId, groupId)
  await db.query('delete from exclusions where id = $1 and group_id = $2', [exclusionId, groupId])
}

// ---- draw (organiser only, idempotent, transactional) ---------------------
export async function runDraw(
  db: Db,
  callerId: string,
  groupId: string,
): Promise<{ count: number; reciprocalCount: number }> {
  const group = await requireOrganiser(db, callerId, groupId)

  if (group.status === 'drawn' || group.status === 'revealed') {
    const { rows } = await db.query('select count(*)::int as n from assignments where group_id = $1', [
      groupId,
    ])
    return { count: (rows[0]?.n as number) ?? 0, reciprocalCount: 0 }
  }

  const members = await db.query('select profile_id from group_members where group_id = $1', [groupId])
  const participants = members.rows.map((r) => ({ id: r.profile_id as string }))
  if (participants.length < 3) {
    throw new ApiError(400, 'too_few', 'You need at least 3 buddies to run a draw.')
  }
  const exRows = await db.query('select giver_id, receiver_id from exclusions where group_id = $1', [
    groupId,
  ])
  const exclusions = exRows.rows.map((r) => ({
    giver_id: r.giver_id as string,
    receiver_id: r.receiver_id as string,
  }))

  const seed = [...groupId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  let result
  try {
    result = computeDraw(participants, exclusions, { seed })
  } catch (e) {
    throw new ApiError(422, 'infeasible', (e as Error).message)
  }
  const check = validateDraw(participants, result.pairs, exclusions)
  if (!check.valid) throw new ApiError(422, 'invalid', check.errors.join('; '))

  await db.tx(async (q) => {
    // Guard again inside the transaction to avoid a double-draw race.
    const g = await q.query('select status from groups where id = $1 for update', [groupId])
    const status = g.rows[0]?.status as GroupStatus | undefined
    if (status === 'drawn' || status === 'revealed') {
      throw new ApiError(409, 'already_drawn', 'The draw has already run.')
    }
    await q.query('delete from assignments where group_id = $1', [groupId])
    for (const pair of result.pairs) {
      await q.query(
        'insert into assignments (id, group_id, giver_id, receiver_id) values ($1,$2,$3,$4)',
        [uid('asg-'), groupId, pair.giver_id, pair.receiver_id],
      )
    }
    await q.query("update groups set status = 'drawn', draw_at = now() where id = $1", [groupId])
  })

  return { count: result.pairs.length, reciprocalCount: result.reciprocalCount }
}

// ---- anonymous questions --------------------------------------------------
export async function askQuestion(
  db: Db,
  callerId: string,
  groupId: string,
  question: string,
): Promise<AnonymousQuestion> {
  const receiverId = await getMyReceiverId(db, callerId, groupId)
  if (!receiverId) throw new ApiError(409, 'no_buddy', 'You can only ask your assigned buddy.')
  const { rows } = await db.query(
    `insert into anonymous_questions (id, group_id, sender_id, recipient_id, question, status)
     values ($1,$2,$3,$4,$5,'pending') returning *`,
    [uid('q-'), groupId, callerId, receiverId, question.trim()],
  )
  return toQuestion(rows[0]!)
}

export async function listQuestionsIAsked(
  db: Db,
  callerId: string,
  groupId: string,
): Promise<AnonymousQuestion[]> {
  const { rows } = await db.query(
    'select * from anonymous_questions where group_id = $1 and sender_id = $2 order by created_at desc',
    [groupId, callerId],
  )
  return rows.map(toQuestion)
}

/** Recipient's questions — sender_id is stripped so anonymity holds. */
export async function listQuestionsForMe(
  db: Db,
  callerId: string,
  groupId: string,
): Promise<Omit<AnonymousQuestion, 'sender_id'>[]> {
  const { rows } = await db.query(
    'select * from anonymous_questions where group_id = $1 and recipient_id = $2 order by created_at desc',
    [groupId, callerId],
  )
  return rows.map((r) => {
    const { sender_id: _omit, ...rest } = toQuestion(r)
    return rest
  })
}

export async function answerQuestion(
  db: Db,
  callerId: string,
  questionId: string,
  answer: string,
): Promise<void> {
  const { rows } = await db.query(
    `update anonymous_questions set answer = $3, status = 'answered', answered_at = now()
     where id = $1 and recipient_id = $2 returning id`,
    [questionId, callerId, answer.trim()],
  )
  if (!rows[0]) throw new ApiError(403, 'not_recipient', 'You can only answer your own questions.')
}

// ---- missions -------------------------------------------------------------
export async function listMissions(db: Db, groupId: string): Promise<Mission[]> {
  const { rows } = await db.query(
    'select * from missions where group_id = $1 order by starts_at desc nulls last',
    [groupId],
  )
  return rows.map(toMission)
}

export async function currentMission(db: Db, groupId: string): Promise<Mission | null> {
  const missions = await listMissions(db, groupId)
  return missions[0] ?? null
}

export async function createMission(
  db: Db,
  callerId: string,
  groupId: string,
  input: Omit<Mission, 'id' | 'group_id' | 'created_at'>,
): Promise<Mission> {
  await requireOrganiser(db, callerId, groupId)
  const { rows } = await db.query(
    `insert into missions (id, group_id, title, tagline, body, accent, starts_at, ends_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [uid('mis-'), groupId, input.title, input.tagline, input.body, input.accent, input.starts_at, input.ends_at],
  )
  return toMission(rows[0]!)
}

// ---- inbox ----------------------------------------------------------------
export async function listInbox(db: Db, callerId: string, groupId: string): Promise<InboxItem[]> {
  const reads = await db.query('select item_id from inbox_reads where profile_id = $1 and group_id = $2', [
    callerId,
    groupId,
  ])
  const readSet = new Set(reads.rows.map((r) => r.item_id as string))

  const items: InboxItem[] = []

  const answered = await db.query(
    `select q.*, p.display_name as recipient_name
     from anonymous_questions q join profiles p on p.id = q.recipient_id
     where q.group_id = $1 and q.sender_id = $2 and q.status = 'answered'`,
    [groupId, callerId],
  )
  for (const r of answered.rows) {
    const id = `inbox-ans-${r.id}`
    items.push({
      id,
      kind: 'question_answered',
      title: `${r.recipient_name} answered your question`,
      body: (r.answer as string) ?? '',
      created_at: iso(r.answered_at ?? r.created_at),
      read: readSet.has(id),
      href: '/app/messages',
    })
  }

  const received = await db.query(
    `select * from anonymous_questions where group_id = $1 and recipient_id = $2 and status = 'pending'`,
    [groupId, callerId],
  )
  for (const r of received.rows) {
    const id = `inbox-recv-${r.id}`
    items.push({
      id,
      kind: 'question_received',
      title: 'Your Secret Buddy asked you something',
      body: r.question as string,
      created_at: iso(r.created_at),
      read: readSet.has(id),
      href: '/app/messages',
    })
  }

  const mission = await currentMission(db, groupId)
  if (mission) {
    const id = `inbox-mission-${mission.id}`
    items.push({
      id,
      kind: 'new_mission',
      title: `New mission — ${mission.tagline}`,
      body: mission.body,
      created_at: mission.created_at,
      read: readSet.has(id),
      href: '/app/missions',
    })
  }

  return items.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function markInboxRead(
  db: Db,
  callerId: string,
  groupId: string,
  itemId: string,
): Promise<void> {
  await db.query(
    `insert into inbox_reads (profile_id, group_id, item_id) values ($1,$2,$3)
     on conflict (profile_id, item_id) do nothing`,
    [callerId, groupId, itemId],
  )
}
