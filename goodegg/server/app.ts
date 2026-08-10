import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { GroupStatus } from '../src/lib/types'
import type { Db } from './db'
import { SESSION_COOKIE, issueSession, verifySession } from './auth'
import * as repo from './repo'
import { ApiError } from './repo'

/**
 * Build the API application over a given database. Kept separate from the
 * server entry so tests can mount it against PGlite.
 */
export function createApp(db: Db) {
  const app = new Hono()

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.code, message: err.message }, err.status as 400)
    }
    console.error('Unhandled error:', err)
    return c.json({ error: 'server_error', message: 'Something went wrong.' }, 500)
  })

  const api = new Hono()

  async function caller(c: Context): Promise<string | null> {
    return verifySession(getCookie(c, SESSION_COOKIE))
  }
  async function requireAuth(c: Context): Promise<string> {
    const id = await caller(c)
    if (!id) throw new ApiError(401, 'unauthenticated', 'Please sign in.')
    return id
  }

  const isProd = process.env.NODE_ENV === 'production'
  function setSession(c: Context, token: string) {
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isProd,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
  }

  // ---- auth ----
  api.post('/auth/request', async (c) => {
    const { email, displayName } = await c.req.json<{ email: string; displayName?: string }>()
    await repo.requestOtp(db, email, displayName)
    return c.json({ ok: true })
  })

  api.post('/auth/verify', async (c) => {
    const { email, code } = await c.req.json<{ email: string; code: string }>()
    const { profile } = await repo.verifyOtp(db, email, code)
    setSession(c, await issueSession(profile.id))
    return c.json({ profile })
  })

  api.post('/auth/signout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  api.get('/me', async (c) => {
    const id = await caller(c)
    return c.json({ profile: id ? await repo.getProfile(db, id) : null })
  })

  api.patch('/me', async (c) => {
    const id = await requireAuth(c)
    const patch = await c.req.json<{ display_name?: string; avatar_seed?: string }>()
    return c.json({ profile: await repo.updateProfile(db, id, patch) })
  })

  // ---- groups ----
  api.post('/groups', async (c) => {
    const id = await requireAuth(c)
    const input = await c.req.json<repo.CreateGroupInput>()
    return c.json({ group: await repo.createGroup(db, id, input) })
  })

  api.get('/groups/by-code/:code', async (c) => {
    return c.json({ group: await repo.getGroupByCode(db, c.req.param('code')) })
  })

  api.get('/groups/:id', async (c) => {
    return c.json({ group: await repo.getGroup(db, c.req.param('id')) })
  })

  api.patch('/groups/:id', async (c) => {
    const id = await requireAuth(c)
    const patch = await c.req.json()
    return c.json({ group: await repo.updateGroup(db, id, c.req.param('id'), patch) })
  })

  api.post('/groups/:id/status', async (c) => {
    const id = await requireAuth(c)
    const { status } = await c.req.json<{ status: GroupStatus }>()
    return c.json({ group: await repo.setGroupStatus(db, id, c.req.param('id'), status) })
  })

  api.get('/memberships', async (c) => {
    const id = await requireAuth(c)
    return c.json({ memberships: await repo.listMyMemberships(db, id) })
  })

  api.post('/join', async (c) => {
    const id = await requireAuth(c)
    const { code, displayName } = await c.req.json<{ code: string; displayName: string }>()
    return c.json({ membership: await repo.joinGroup(db, id, code, displayName) })
  })

  api.get('/groups/:id/membership', async (c) => {
    const id = await requireAuth(c)
    return c.json({ membership: await repo.getMyMembership(db, id, c.req.param('id')) })
  })

  api.get('/groups/:id/participants', async (c) => {
    const id = await requireAuth(c)
    return c.json({ participants: await repo.listParticipants(db, id, c.req.param('id')) })
  })

  api.delete('/groups/:id/participants/:memberId', async (c) => {
    const id = await requireAuth(c)
    await repo.removeParticipant(db, id, c.req.param('id'), c.req.param('memberId'))
    return c.json({ ok: true })
  })

  // ---- buddy profile ----
  api.get('/groups/:id/buddy-profile', async (c) => {
    const id = await requireAuth(c)
    return c.json({ profile: await repo.getMyBuddyProfile(db, id, c.req.param('id')) })
  })

  api.put('/groups/:id/buddy-profile', async (c) => {
    const id = await requireAuth(c)
    const input = await c.req.json<repo.BuddyProfileInput>()
    return c.json({ profile: await repo.upsertMyBuddyProfile(db, id, c.req.param('id'), input) })
  })

  api.get('/groups/:id/buddy', async (c) => {
    const id = await requireAuth(c)
    return c.json({ buddy: await repo.getMyBuddy(db, id, c.req.param('id')) })
  })

  api.get('/groups/:id/receiver', async (c) => {
    const id = await requireAuth(c)
    return c.json({ receiver_id: await repo.getMyReceiverId(db, id, c.req.param('id')) })
  })

  api.get('/groups/:id/revealed', async (c) => {
    const id = await requireAuth(c)
    return c.json({ revealed: await repo.hasRevealed(db, id, c.req.param('id')) })
  })

  api.post('/groups/:id/reveal', async (c) => {
    const id = await requireAuth(c)
    await repo.markRevealed(db, id, c.req.param('id'))
    return c.json({ ok: true })
  })

  // ---- exclusions ----
  api.get('/groups/:id/exclusions', async (c) => {
    const id = await requireAuth(c)
    return c.json({ exclusions: await repo.listExclusions(db, id, c.req.param('id')) })
  })
  api.post('/groups/:id/exclusions', async (c) => {
    const id = await requireAuth(c)
    const { giver_id, receiver_id, reason } = await c.req.json<{
      giver_id: string
      receiver_id: string
      reason?: string
    }>()
    return c.json({
      exclusion: await repo.addExclusion(db, id, c.req.param('id'), giver_id, receiver_id, reason),
    })
  })
  api.delete('/groups/:id/exclusions/:exclusionId', async (c) => {
    const id = await requireAuth(c)
    await repo.removeExclusion(db, id, c.req.param('id'), c.req.param('exclusionId'))
    return c.json({ ok: true })
  })

  // ---- draw ----
  api.post('/groups/:id/draw', async (c) => {
    const id = await requireAuth(c)
    return c.json(await repo.runDraw(db, id, c.req.param('id')))
  })

  // ---- questions ----
  api.post('/groups/:id/questions', async (c) => {
    const id = await requireAuth(c)
    const { question } = await c.req.json<{ question: string }>()
    return c.json({ question: await repo.askQuestion(db, id, c.req.param('id'), question) })
  })
  api.get('/groups/:id/questions/asked', async (c) => {
    const id = await requireAuth(c)
    return c.json({ questions: await repo.listQuestionsIAsked(db, id, c.req.param('id')) })
  })
  api.get('/groups/:id/questions/for-me', async (c) => {
    const id = await requireAuth(c)
    return c.json({ questions: await repo.listQuestionsForMe(db, id, c.req.param('id')) })
  })
  api.post('/questions/:qid/answer', async (c) => {
    const id = await requireAuth(c)
    const { answer } = await c.req.json<{ answer: string }>()
    await repo.answerQuestion(db, id, c.req.param('qid'), answer)
    return c.json({ ok: true })
  })

  // ---- missions ----
  api.get('/groups/:id/missions', async (c) => {
    return c.json({ missions: await repo.listMissions(db, c.req.param('id')) })
  })
  api.get('/groups/:id/missions/current', async (c) => {
    return c.json({ mission: await repo.currentMission(db, c.req.param('id')) })
  })
  api.post('/groups/:id/missions', async (c) => {
    const id = await requireAuth(c)
    const input = await c.req.json()
    return c.json({ mission: await repo.createMission(db, id, c.req.param('id'), input) })
  })

  // ---- inbox ----
  api.get('/groups/:id/inbox', async (c) => {
    const id = await requireAuth(c)
    return c.json({ inbox: await repo.listInbox(db, id, c.req.param('id')) })
  })
  api.post('/groups/:id/inbox/read', async (c) => {
    const id = await requireAuth(c)
    const { itemId } = await c.req.json<{ itemId: string }>()
    await repo.markInboxRead(db, id, c.req.param('id'), itemId)
    return c.json({ ok: true })
  })

  app.route('/api', api)
  return app
}
