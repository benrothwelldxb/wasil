import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import prisma from '../../src/services/prisma'
import { generateProviderAccessToken } from '../../src/services/jwt'
import providerPortalRoutes from '../../src/routes/providerPortal'

// End-to-end against a real Postgres: real JWT verification + real
// requireProvider lookup + real scoped SQL. Proves tenant isolation holds at
// the database layer (not just where mocks were asserted), and that the schema
// the app expects actually exists.

const TAG = 'itest-scope'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/provider-portal', providerPortalRoutes)
  return app
}

async function seed(suffix: string) {
  const school = await prisma.school.create({ data: { name: `${TAG}-school-${suffix}`, shortName: `${TAG}${suffix}`, city: 'Dubai' } })
  const provider = await prisma.provider.create({ data: { name: `${TAG}-prov-${suffix}`, type: 'ECA' } })
  await prisma.providerSchoolLink.create({ data: { providerId: provider.id, schoolId: school.id } })
  const pu = await prisma.providerUser.create({ data: { providerId: provider.id, email: `${TAG}-${suffix}@example.com`, name: 'Coach' } })
  const now = new Date()
  const term = await prisma.ecaTerm.create({
    data: {
      schoolId: school.id, name: 'T1', termNumber: 1, academicYear: '2026/27',
      startDate: now, endDate: now, registrationOpens: now, registrationCloses: now,
    },
  })
  const activity = await prisma.ecaActivity.create({
    data: { ecaTermId: term.id, schoolId: school.id, providerId: provider.id, name: `${TAG}-club-${suffix}`, dayOfWeek: 1, timeSlot: 'AFTER_SCHOOL' },
  })
  return { school, provider, pu, activity }
}

async function cleanup() {
  await prisma.ecaActivity.deleteMany({ where: { name: { startsWith: TAG } } })
  await prisma.providerUser.deleteMany({ where: { email: { startsWith: TAG } } })
  await prisma.ecaTerm.deleteMany({ where: { school: { name: { startsWith: TAG } } } })
  await prisma.provider.deleteMany({ where: { name: { startsWith: `${TAG}-prov` } } })
  await prisma.school.deleteMany({ where: { name: { startsWith: TAG } } })
}

let A: Awaited<ReturnType<typeof seed>>
let B: Awaited<ReturnType<typeof seed>>
let tokenA = ''

beforeAll(async () => {
  await cleanup()
  A = await seed('a')
  B = await seed('b')
  tokenA = generateProviderAccessToken(A.pu)
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

describe('provider activity scoping (real Postgres)', () => {
  it('returns only the calling provider\'s own activities', async () => {
    const res = await request(makeApp())
      .get('/api/provider-portal/activities')
      .set('Authorization', `Bearer ${tokenA}`)

    expect(res.status).toBe(200)
    const names = (res.body as Array<{ name: string }>).map(a => a.name)
    expect(names).toContain(A.activity.name)
    expect(names).not.toContain(B.activity.name)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await request(makeApp()).get('/api/provider-portal/activities')
    expect(res.status).toBe(401)
  })
})
