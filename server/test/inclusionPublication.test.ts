import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createHash } from 'crypto'

// Publishing a child's IEP to their family is an ACT. It must be asked for.
//
// Both push routes wrote `parentVisible !== false`, so a caller who never heard
// of the flag published by saying nothing — and GET /inclusion/my-children
// serves any parentVisible ACTIVE/COMPLETED IEP to a linked parent. No
// decision, no actor, no record that it happened.
const prismaMock = {
  inclusionApiKey: { findUnique: vi.fn(), update: vi.fn() },
  student: { findFirst: vi.fn() },
  studentIep: { findFirst: vi.fn(), upsert: vi.fn(), create: vi.fn(), update: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn() }))
vi.mock('../src/middleware/auth', () => ({
  isAdmin: (_q: unknown, _s: unknown, n: () => void) => n(),
  isAuthenticated: (_q: unknown, _s: unknown, n: () => void) => n(),
  loadUserWithRelations: vi.fn(),
}))

const { default: inclusionRoutes } = await import('../src/routes/inclusion')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/inclusion', inclusionRoutes)
  return app
}

const KEY = 'inc_key'
const send = (body: Record<string, unknown>) =>
  request(makeApp()).post('/api/inclusion/sync/iep').set('X-API-Key', KEY).send(body)

const IEP = { externalId: 'e-1', studentId: 'ext-1', title: 'Spring IEP', targets: [{ area: 'Reading', target: 'Blend CVC' }] }

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.inclusionApiKey.findUnique.mockResolvedValue({
    id: 'k-1', schoolId: 'sch-1', isActive: true, key: createHash('sha256').update(KEY).digest('hex'),
    school: { id: 'sch-1', name: 'VH' },
  })
  prismaMock.inclusionApiKey.update.mockResolvedValue({})
  prismaMock.student.findFirst.mockResolvedValue({ id: 'stu-1' })
  prismaMock.studentIep.findFirst.mockResolvedValue(null)
  prismaMock.studentIep.upsert.mockImplementation(async ({ create }: any) => ({ id: 'iep-1', ...create }))
})

describe('POST /api/inclusion/sync/iep — publication is an act', () => {
  it('does NOT publish when the caller says nothing', async () => {
    const res = await send(IEP)
    expect(res.status).toBeLessThan(400)
    expect(prismaMock.studentIep.upsert.mock.calls[0][0].create.parentVisible).toBe(false)
  })

  it('does not publish on an explicit false either', async () => {
    await send({ ...IEP, parentVisible: false })
    expect(prismaMock.studentIep.upsert.mock.calls[0][0].create.parentVisible).toBe(false)
  })

  it('publishes only on an explicit true', async () => {
    await send({ ...IEP, parentVisible: true })
    expect(prismaMock.studentIep.upsert.mock.calls[0][0].create.parentVisible).toBe(true)
  })

  // A truthy-but-not-true value is not a decision to publish a child's plan.
  it('treats a non-boolean as no decision', async () => {
    await send({ ...IEP, parentVisible: 'yes' })
    expect(prismaMock.studentIep.upsert.mock.calls[0][0].create.parentVisible).toBe(false)
  })
})
