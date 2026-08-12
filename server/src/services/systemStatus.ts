import prisma from './prisma.js'

/**
 * Internal status page data. Each dependency reports a colour-coded state:
 *   ok            — reachable / configured and healthy         (green)
 *   degraded      — reachable but a warning signal is present  (amber)
 *   down          — unreachable / failing                      (red)
 *   not_configured— optional dependency not wired in this env  (grey)
 *
 * Checks are cheap and side-effect-free (a DB ping + config presence + a read
 * of the outbox to infer worker/queue health). We deliberately do NOT send a
 * test email/SMS/push on every status poll — that would cost money and spam —
 * so those report configuration + recent delivery health from the outbox
 * instead of a live round-trip.
 */

export type ComponentState = 'ok' | 'degraded' | 'down' | 'not_configured'

export interface ComponentStatus {
  component: string
  state: ComponentState
  detail: string
}

export interface SystemStatus {
  generatedAt: string
  overall: ComponentState
  components: ComponentStatus[]
}

const WORKER_STALL_SEC = 600 // oldest PENDING older than this ⇒ worker may be stalled

async function checkDatabase(): Promise<ComponentStatus> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    const ms = Date.now() - start
    return {
      component: 'Database',
      state: ms > 1000 ? 'degraded' : 'ok',
      detail: `SELECT 1 in ${ms}ms`,
    }
  } catch (e) {
    return { component: 'Database', state: 'down', detail: (e as Error).message }
  }
}

async function checkQueueAndWorkers(): Promise<ComponentStatus[]> {
  try {
    const [pending, failed, oldest] = await Promise.all([
      prisma.outboxEntry.count({ where: { status: 'PENDING' } }),
      prisma.outboxEntry.count({ where: { status: 'FAILED' } }),
      prisma.outboxEntry.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ])
    const oldestAgeSec = oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1000) : 0

    // Workers: inferred from whether the oldest pending job is being drained.
    const workerState: ComponentState = oldestAgeSec > WORKER_STALL_SEC ? 'degraded' : 'ok'
    const workers: ComponentStatus = {
      component: 'Background workers',
      state: workerState,
      detail: oldestAgeSec > WORKER_STALL_SEC
        ? `oldest pending job is ${oldestAgeSec}s old — worker may be stalled`
        : 'draining normally',
    }

    const queueState: ComponentState = failed > 0 ? 'degraded' : 'ok'
    const queue: ComponentStatus = {
      component: 'Queues (outbox)',
      state: queueState,
      detail: `${pending} pending, ${failed} failed`,
    }
    return [workers, queue]
  } catch (e) {
    return [{ component: 'Queues (outbox)', state: 'down', detail: (e as Error).message }]
  }
}

function checkConfigured(component: string, present: boolean, presentDetail: string): ComponentStatus {
  return present
    ? { component, state: 'ok', detail: presentDetail }
    : { component, state: 'not_configured', detail: 'not configured in this environment' }
}

const RANK: Record<ComponentState, number> = { ok: 0, not_configured: 0, degraded: 1, down: 2 }

export async function getSystemStatus(): Promise<SystemStatus> {
  const env = process.env
  const [db, queueWorkers] = await Promise.all([checkDatabase(), checkQueueAndWorkers()])

  const components: ComponentStatus[] = [
    db,
    ...queueWorkers,
    checkConfigured('Email (Resend)', !!env.RESEND_API_KEY, `from ${env.RESEND_FROM_EMAIL || 'default sender'}`),
    checkConfigured('Push (Firebase)', !!(env.FIREBASE_PROJECT_ID || env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_SERVICE_ACCOUNT), 'service account present'),
    checkConfigured('SMS/WhatsApp (Twilio)', !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN), 'credentials present'),
    checkConfigured('Storage (S3/R2)', !!(env.S3_ENDPOINT && env.S3_BUCKET), `bucket ${env.S3_BUCKET || '—'}`),
    checkConfigured('Redis', !!env.REDIS_URL, 'configured'),
    checkConfigured('Error reporting (Sentry)', !!env.SENTRY_DSN, 'DSN present'),
    checkConfigured('Wasil Hub', !!(env.HUB_BASE_URL || env.WASIL_HUB_URL), 'configured'),
  ]

  // Overall = worst component state (not_configured never worsens the picture —
  // an unwired optional dependency is not an outage).
  const overall = components.reduce<ComponentState>((worst, c) =>
    RANK[c.state] > RANK[worst] ? c.state : worst, 'ok')

  return { generatedAt: new Date().toISOString(), overall, components }
}
