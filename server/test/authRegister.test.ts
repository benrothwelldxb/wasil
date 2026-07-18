import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import bcrypt from 'bcrypt'

// Mock the data + token + side-effect layers so the register route can be
// exercised end-to-end without a database.
const prismaMock = {
  parentInvitation: { findUnique: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  child: { findFirst: vi.fn(), create: vi.fn() },
  parentStudentLink: { findUnique: vi.fn(), create: vi.fn() },
}
vi.mock('../src/services/prisma', () => ({ default: prismaMock }))
vi.mock('../src/services/jwt', () => ({
  generateAccessToken: vi.fn(() => 'access-token'),
  generateRefreshToken: vi.fn(async () => 'refresh-token'),
  revokeRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}))
vi.mock('../src/services/email', () => ({ sendMagicLinkEmail: vi.fn(), sendInvitationEmail: vi.fn() }))
vi.mock('../src/services/audit', () => ({ logAudit: vi.fn(), computeChanges: vi.fn(() => ({})) }))

const { default: authRoutes } = await import('../src/routes/auth')

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/auth', authRoutes)
  return app
}

const PENDING_INVITE = {
  id: 'inv-1',
  status: 'PENDING',
  schoolId: 'school-A',
  parentEmail: null as string | null,
  parentName: 'Parent',
  school: { id: 'school-A', name: 'VHPS' },
  childLinks: [],
  studentLinks: [],
}

const VALID_PASSWORD = 'Whatever123' // satisfies min-8 + upper + lower + digit

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.parentInvitation.findUnique.mockResolvedValue({ ...PENDING_INVITE })
  prismaMock.parentInvitation.update.mockResolvedValue({})
})

// Guards the P0: /auth/register must never mint tokens for an existing account
// without proof of ownership.
describe('POST /auth/register — account-takeover guardrails', () => {
  it('refuses to authenticate an existing ADMIN account by email (the P0)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'admin-1', role: 'ADMIN', schoolId: 'school-A', passwordHash: 'existing-hash',
    })

    const res = await request(makeApp()).post('/auth/register').send({
      accessCode: 'AAA-BBB-CCC',
      email: 'principal@vhprimarycoa.ae',
      password: VALID_PASSWORD,
      name: 'Attacker',
    })

    expect(res.status).toBe(409)
    expect(res.body.accessToken).toBeUndefined()
    expect(res.body.refreshToken).toBeUndefined()
  })

  it('refuses an existing parent when the supplied password is wrong', async () => {
    const passwordHash = await bcrypt.hash('the-real-password', 4)
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'parent-1', role: 'PARENT', schoolId: 'school-A', passwordHash,
    })

    const res = await request(makeApp()).post('/auth/register').send({
      accessCode: 'AAA-BBB-CCC',
      email: 'parent@example.com',
      password: VALID_PASSWORD, // != the real password
      name: 'Parent',
    })

    expect(res.status).toBe(409)
    expect(res.body.accessToken).toBeUndefined()
  })

  it('rejects when the email does not match an email-bound invitation', async () => {
    prismaMock.parentInvitation.findUnique.mockResolvedValue({ ...PENDING_INVITE, parentEmail: 'real@example.com' })
    prismaMock.user.findUnique.mockResolvedValue(null)

    const res = await request(makeApp()).post('/auth/register').send({
      accessCode: 'AAA-BBB-CCC',
      email: 'attacker@example.com',
      password: VALID_PASSWORD,
      name: 'Attacker',
    })

    expect(res.status).toBe(400)
    expect(res.body.accessToken).toBeUndefined()
  })

  it('lets a brand-new parent register and returns tokens', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(null) // existence check → new user
      .mockResolvedValueOnce({     // fullUser fetch for the response
        id: 'new-1', role: 'PARENT', schoolId: 'school-A',
        email: 'new@example.com', name: 'New Parent',
        children: [], studentLinks: [], school: PENDING_INVITE.school,
      })
    prismaMock.user.create.mockResolvedValue({ id: 'new-1', role: 'PARENT', schoolId: 'school-A' })

    const res = await request(makeApp()).post('/auth/register').send({
      accessCode: 'AAA-BBB-CCC',
      email: 'new@example.com',
      password: VALID_PASSWORD,
      name: 'New Parent',
    })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('access-token')
    expect(res.body.refreshToken).toBe('refresh-token')
  })
})
