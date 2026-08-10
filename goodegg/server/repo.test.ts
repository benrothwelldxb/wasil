// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import type { Db } from './db'
import { runMigrations } from './db'
import * as repo from './repo'
import { ApiError } from './repo'

/** A PGlite-backed Db — an in-process Postgres, no server required. */
function pgliteDb(): Db {
  const pg = new PGlite()
  const wrap = (r: { rows: unknown[] }) => ({ rows: r.rows as Record<string, unknown>[] })
  return {
    query: async (text, params) => wrap(await pg.query(text, (params ?? []) as unknown[])),
    exec: async (sql) => {
      await pg.exec(sql)
    },
    tx: (fn) =>
      pg.transaction(async (tx) =>
        fn({ query: async (text, params) => wrap(await tx.query(text, (params ?? []) as unknown[])) }),
      ) as Promise<never>,
    close: () => pg.close(),
  }
}

async function signInId(db: Db, email: string, name: string): Promise<string> {
  const code = await repo.requestOtp(db, email, name)
  const { profile } = await repo.verifyOtp(db, email, code)
  return profile.id
}

const buddyInput = (name: string): repo.BuddyProfileInput => ({
  preferred_name: name,
  birthday: null,
  drink: 'Flat white',
  sweet_or_savoury: 'sweet',
  favourite_snacks: ['Chocolate', 'Percy Pigs'],
  favourite_shops: ['M&S'],
  interests: ['Plants'],
  favourite_colours: ['Green'],
  little_things: 'Nice pens',
  dislikes: ['Turkish Delight'],
  dietary_requirements: [],
  free_text: '',
})

const TABLES = [
  'inbox_reads', 'accomplices', 'missions', 'anonymous_questions', 'exclusions',
  'assignments', 'buddy_profiles', 'group_members', 'groups', 'login_codes', 'profiles',
]

let db: Db
beforeAll(async () => {
  db = pgliteDb()
  await runMigrations(db)
})
beforeEach(async () => {
  await db.exec(`truncate ${TABLES.join(', ')} cascade`)
})

describe('auth (6-digit code)', () => {
  it('signs in with a valid code and rejects a wrong one', async () => {
    const code = await repo.requestOtp(db, 'ana@x.example', 'Ana')
    await expect(repo.verifyOtp(db, 'ana@x.example', '000000')).rejects.toBeInstanceOf(ApiError)
    const { profile } = await repo.verifyOtp(db, 'ana@x.example', code)
    expect(profile.display_name).toBe('Ana')
    expect(profile.email).toBe('ana@x.example')
  })

  it('returns the same profile on a second sign-in', async () => {
    const a = await signInId(db, 'ben@x.example', 'Ben')
    const b = await signInId(db, 'ben@x.example', 'Ben')
    expect(a).toBe(b)
  })
})

describe('happy path end to end', () => {
  it('create → join → profiles → draw → reveal → view → ask → answer', async () => {
    const olivia = await signInId(db, 'olivia@x.example', 'Olivia')
    const group = await repo.createGroup(db, olivia, { name: 'Test Eggs', organiser_name: 'Olivia' })
    expect(group.status).toBe('open')

    const ids: Record<string, string> = { Olivia: olivia }
    for (const name of ['Ana', 'Ben', 'Cara']) {
      const id = await signInId(db, `${name.toLowerCase()}@x.example`, name)
      ids[name] = id
      await repo.joinGroup(db, id, group.join_code, name)
      await repo.upsertMyBuddyProfile(db, id, group.id, buddyInput(name))
    }
    await repo.upsertMyBuddyProfile(db, olivia, group.id, buddyInput('Olivia'))

    const participants = await repo.listParticipants(db, olivia, group.id)
    expect(participants).toHaveLength(4)
    expect(participants.every((p) => p.profile_complete)).toBe(true)
    // Organiser-safe view carries no assignment data
    expect(participants[0]).not.toHaveProperty('receiver_id')

    const result = await repo.runDraw(db, olivia, group.id)
    expect(result.count).toBe(4)
    expect((await repo.getGroup(db, group.id))?.status).toBe('drawn')

    // Ben reveals + views his buddy
    const ben = ids.Ben!
    const receiverId = await repo.getMyReceiverId(db, ben, group.id)
    expect(receiverId).toBeTruthy()
    await repo.markRevealed(db, ben, group.id)
    expect(await repo.hasRevealed(db, ben, group.id)).toBe(true)
    const buddy = await repo.getMyBuddy(db, ben, group.id)
    expect(buddy?.profile_id).toBe(receiverId)

    // Ben asks; the recipient answers without learning who asked
    await repo.askQuestion(db, ben, group.id, 'Favourite snack?')
    const forRecipient = await repo.listQuestionsForMe(db, receiverId!, group.id)
    expect(forRecipient.length).toBeGreaterThan(0)
    expect(forRecipient[0]).not.toHaveProperty('sender_id')
    await repo.answerQuestion(db, receiverId!, forRecipient[0]!.id, 'Percy Pigs.')

    const asked = await repo.listQuestionsIAsked(db, ben, group.id)
    expect(asked[0]?.answer).toBe('Percy Pigs.')
  })
})

describe('security', () => {
  async function setupGroup() {
    const olivia = await signInId(db, 'o@x.example', 'Olivia')
    const group = await repo.createGroup(db, olivia, { name: 'G', organiser_name: 'Olivia' })
    const members: string[] = [olivia]
    for (const n of ['A', 'B', 'C']) {
      const id = await signInId(db, `${n}@x.example`, n)
      await repo.joinGroup(db, id, group.join_code, n)
      members.push(id)
    }
    return { olivia, group, members }
  }

  it('non-organiser cannot run the draw', async () => {
    const { group, members } = await setupGroup()
    await expect(repo.runDraw(db, members[1]!, group.id)).rejects.toMatchObject({
      code: 'not_organiser',
    })
  })

  it('the draw is idempotent', async () => {
    const { olivia, group } = await setupGroup()
    const first = await repo.runDraw(db, olivia, group.id)
    const second = await repo.runDraw(db, olivia, group.id)
    expect(second.count).toBe(first.count)
  })

  it('you cannot ask before you have a buddy', async () => {
    const { group, members } = await setupGroup()
    await expect(repo.askQuestion(db, members[1]!, group.id, 'Hi?')).rejects.toMatchObject({
      code: 'no_buddy',
    })
  })

  it('non-members cannot list participants', async () => {
    const { group } = await setupGroup()
    const stranger = await signInId(db, 'stranger@x.example', 'Stranger')
    await expect(repo.listParticipants(db, stranger, group.id)).rejects.toMatchObject({
      code: 'not_member',
    })
  })
})
