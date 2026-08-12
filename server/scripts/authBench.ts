/**
 * Passwordless verify — load benchmark (Task 8).
 *
 * Measures the DATABASE work a `/auth/code/verify` request performs, at
 * 100 / 1,000 / 10,000 simultaneous attempts, in the two shapes that matter:
 *
 *   • THROUGHPUT  — each attempt hits a DIFFERENT code row (no row contention).
 *                   Bounded by the connection pool + DB CPU. Represents many
 *                   different parents signing in at once.
 *   • CONTENTION  — every attempt hits the SAME code row (max row-lock
 *                   contention). This is the security-critical path: it proves
 *                   the atomic slot-claim serialises correctly under load and
 *                   shows the cost of that serialisation.
 *
 * We benchmark the DB layer directly (the identified bottleneck) rather than
 * the full HTTP handler so the numbers aren't dominated by Express/supertest
 * overhead or clipped by the rate limiter — those are deliberately separate
 * concerns. The DB sequence here is byte-for-byte the handler's wrong-guess
 * path: findFirst → atomic claim → conditional kill-at-ceiling.
 *
 * Run:
 *   DATABASE_URL=…?connection_limit=20 PGSSLMODE=disable \
 *     node --import tsx scripts/authBench.ts
 */
import crypto from 'crypto'
import prisma from '../src/services/prisma.js'

const MAX_ATTEMPTS = 5
const TAG = 'bench-verify'
const TIERS = (process.env.BENCH_TIERS ?? '100,1000,10000').split(',').map(Number)

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[i]!
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

/** The DB work of one wrong-guess verify (matches routes/auth.ts). */
async function verifyDbWork(email: string): Promise<string> {
  const rec = await prisma.loginCode.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, codeHash: true },
  })
  if (!rec) return 'no_code'
  const claim = await prisma.loginCode.updateMany({
    where: { id: rec.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  })
  if (claim.count === 0) return 'locked'
  // (timing-safe compare omitted — a wrong guess; ~microseconds, not DB-bound)
  await prisma.loginCode.updateMany({
    where: { id: rec.id, consumedAt: null, attempts: { gte: MAX_ATTEMPTS } },
    data: { consumedAt: new Date() },
  })
  return 'wrong'
}

async function seedDistinct(n: number): Promise<string[]> {
  const emails = Array.from({ length: n }, (_, i) => `${TAG}-d-${i}@example.com`)
  await prisma.loginCode.deleteMany({ where: { email: { startsWith: `${TAG}-d-` } } })
  const now = Date.now()
  await prisma.loginCode.createMany({
    data: emails.map((email) => ({
      email, codeHash: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(now + 10 * 60 * 1000), attempts: 0,
    })),
  })
  return emails
}

async function seedSingle(): Promise<string> {
  const email = `${TAG}-single@example.com`
  await prisma.loginCode.deleteMany({ where: { email } })
  await prisma.loginCode.create({
    data: { email, codeHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 },
  })
  return email
}

async function runTier(label: string, tasks: Array<() => Promise<string>>): Promise<void> {
  const latencies: number[] = []
  const outcomes: Record<string, number> = {}
  const rssBefore = process.memoryUsage().rss

  const wallStart = performance.now()
  await Promise.all(
    tasks.map(async (t) => {
      const s = performance.now()
      const r = await t()
      latencies.push(performance.now() - s)
      outcomes[r] = (outcomes[r] ?? 0) + 1
    }),
  )
  const wallMs = performance.now() - wallStart
  const rssAfter = process.memoryUsage().rss

  latencies.sort((a, b) => a - b)
  const n = latencies.length
  const throughput = (n / wallMs) * 1000
  console.log(
    `  ${label.padEnd(12)} n=${String(n).padStart(6)}  ` +
    `wall=${fmt(wallMs).padStart(8)}ms  thr=${fmt(throughput).padStart(8)}/s  ` +
    `p50=${fmt(pct(latencies, 50)).padStart(7)}ms  p95=${fmt(pct(latencies, 95)).padStart(8)}ms  ` +
    `p99=${fmt(pct(latencies, 99)).padStart(8)}ms  max=${fmt(latencies[n - 1]!).padStart(8)}ms  ` +
    `ΔRSS=${fmt((rssAfter - rssBefore) / 1e6)}MB  ${JSON.stringify(outcomes)}`,
  )
}

async function main() {
  const poolInfo = /connection_limit=(\d+)/.exec(process.env.DATABASE_URL ?? '')?.[1] ?? 'default'
  console.log(`\n=== passwordless verify benchmark ===`)
  console.log(`pool connection_limit=${poolInfo}  tiers=${TIERS.join(', ')}\n`)

  for (const C of TIERS) {
    console.log(`concurrency ${C}:`)

    // THROUGHPUT — distinct rows.
    const emails = await seedDistinct(C)
    await runTier('throughput', emails.map((e) => () => verifyDbWork(e)))

    // CONTENTION — one row, C concurrent claims. Proves the cap holds and
    // shows serialisation cost. attempts must end at exactly MAX.
    const single = await seedSingle()
    await runTier('contention', Array.from({ length: C }, () => () => verifyDbWork(single)))
    const row = await prisma.loginCode.findFirst({ where: { email: single } })
    console.log(`     └─ single-row final attempts=${row?.attempts} (cap=${MAX_ATTEMPTS}), consumed=${row?.consumedAt !== null}`)
    console.log('')
  }

  await prisma.loginCode.deleteMany({ where: { email: { startsWith: TAG } } })
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
